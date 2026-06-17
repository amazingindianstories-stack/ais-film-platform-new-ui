import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { createAdminClient } from "@/utils/supabase-admin";
import {
  getFallbackModels,
  runWithModelFallback,
  VIDEO_MODEL_FALLBACKS,
} from "@/utils/googleModelFallbacks";
import {
  DEFAULT_VIDEO_MODEL,
  VIDEO_MODEL_PROVIDER_SEEDANCE,
  normalizeVideoDurationForModel,
  resolveVideoModelOption,
} from "@/utils/generationModels";
import { normalizeShot } from "@/utils/shotList";
import {
  MAX_SUBMIT_RETRIES,
  MAX_POLL_RETRIES,
  VIDEO_SUBMIT_TIMEOUT_MS,
  IMAGE_FETCH_TIMEOUT_MS,
  VIDEO_OPERATION_TIMEOUT_MS,
  STORAGE_UPLOAD_TIMEOUT_MS,
  SOURCE_IMAGE_MAX_BYTES,
  TARGET_ASPECT_RATIO,
  ASPECT_RATIO_TOLERANCE,
  compact,
} from "./shotVideoConstants.js";
import { buildAudioSafePrompt, buildPrompt, selectVideoPrompt } from "./promptBuilder.js";
import { runSeedanceVideoGeneration } from "./seedanceProvider.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 900;

import {
  ai,
  assertWidescreenDimensions,
  downloadGeneratedVideo,
  fetchSourceImage,
  isAudioFilteredVideoError,
  normalizeAspectRatio,
  normalizeResolution,
  pollVideoOperation,
  serializeError,
  shouldFallbackVideoModel,
  withRetry,
  withTimeout,
} from "./videoRouteHelpers.js";


export async function POST(req) {
  let tmpDir;

  try {
    const {
      projectId,
      shot,
      shotIndex = 0,
      projectState = {},
      promptOverride,
      model,
      durationSeconds,
      resolution,
    } = await req.json();

    if (!projectId || !shot) {
      return NextResponse.json({ error: "Missing projectId or shot" }, { status: 400 });
    }

    const selectedModel = resolveVideoModelOption(model || process.env.GOOGLE_VIDEO_MODEL || DEFAULT_VIDEO_MODEL);
    if (selectedModel.provider !== VIDEO_MODEL_PROVIDER_SEEDANCE && !ai) {
      return NextResponse.json({ error: "Clip generation is temporarily unavailable." }, { status: 500 });
    }

    const normalizedShot = normalizeShot(shot, shotIndex);
    const selectedVideoPrompt = selectVideoPrompt(normalizedShot, promptOverride);
    let sourceImage = null;
    let sourceImageDimensions = null;
    try {
      sourceImage = await fetchSourceImage(normalizedShot.image_url);
      sourceImageDimensions = sourceImage?.dimensions || null;
    } catch (error) {
      if (error?.fatal) throw error;
      console.warn(`Shot ${shotIndex + 1} source image could not be used:`, serializeError(error));
    }

    const sourceImageWasUsed = Boolean(sourceImage);
    const requestedDuration = normalizeVideoDurationForModel(
      durationSeconds || normalizedShot.veo_duration_seconds || normalizedShot.duration,
      selectedModel.value
    );

    const basePrompt = buildPrompt({
      shot: normalizedShot,
      projectState,
      promptOverride,
      usedSourceImage: sourceImageWasUsed,
      videoDuration: requestedDuration,
    });
    const requestConfig = {
      numberOfVideos: 1,
      durationSeconds: requestedDuration,
      aspectRatio: normalizeAspectRatio(),
      resolution: normalizeResolution(resolution, requestedDuration),
    };

    let usedAudioSafePrompt = false;
    const runGoogleGeneration = async (promptText) => runWithModelFallback({
      label: `Shot ${shotIndex + 1} video generation`,
      models: getFallbackModels(selectedModel.value, VIDEO_MODEL_FALLBACKS),
      shouldFallback: shouldFallbackVideoModel,
      operation: async (modelName) => {
        const request = {
          model: modelName,
          prompt: promptText,
          config: requestConfig,
        };
        if (sourceImage) {
          request.image = {
            imageBytes: sourceImage.imageBytes,
            mimeType: sourceImage.mimeType,
          };
        }

        const submittedOperation = await withRetry(
          () => withTimeout(
            () => ai.models.generateVideos(request),
            VIDEO_SUBMIT_TIMEOUT_MS,
            `Video model submission (${modelName})`
          ),
          {
            label: `Shot ${shotIndex + 1} video submission (${modelName})`,
            attempts: MAX_SUBMIT_RETRIES,
            baseDelayMs: 1800,
          }
        );

        return pollVideoOperation(submittedOperation);
      },
    });

    let videoGeneration;
    if (selectedModel.provider === VIDEO_MODEL_PROVIDER_SEEDANCE) {
      videoGeneration = await runSeedanceVideoGeneration({
        modelName: selectedModel.value,
        prompt: basePrompt,
        imageUrl: sourceImageWasUsed ? normalizedShot.image_url : null,
        durationSeconds: requestedDuration,
      });
    } else {
      try {
        videoGeneration = await runGoogleGeneration(basePrompt);
      } catch (error) {
        if (!isAudioFilteredVideoError(error)) throw error;
        console.warn(`Shot ${shotIndex + 1} hit audio/safety filter. Retrying once with audio-safe prompt sanitization.`);
        usedAudioSafePrompt = true;
        videoGeneration = await runGoogleGeneration(buildAudioSafePrompt(basePrompt));
      }
    }
    sourceImage = null;

    const completedOperation = videoGeneration.result;
    const generatedVideo = completedOperation.response?.generatedVideos?.[0];
    const mimeType = generatedVideo?.video?.mimeType || "video/mp4";
    const extension = videoExtension(mimeType);

    tmpDir = path.join(os.tmpdir(), `ai-music-video-${projectId}-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, `shot-${String(shotIndex + 1).padStart(3, "0")}.${extension}`);

    await withRetry(
      () => downloadGeneratedVideo(generatedVideo, tmpPath),
      {
        label: `Shot ${shotIndex + 1} video download`,
        attempts: 2,
        baseDelayMs: 1200,
      }
    );
    if (generatedVideo?.video?.videoBytes) generatedVideo.video.videoBytes = undefined;

    const videoBuffer = await readFile(tmpPath);
    const videoDimensions = assertWidescreenDimensions(
      parseMp4VideoDimensions(videoBuffer),
      `Shot ${shotIndex + 1} generated video`
    );
    const storagePath = `${projectId}/videos/shot-${String(shotIndex + 1).padStart(3, "0")}-${Date.now()}.${extension}`;
    const supabase = createAdminClient();

    await withRetry(
      () => withTimeout(
        async () => {
          const { error: uploadError } = await supabase.storage
            .from("assets")
            .upload(storagePath, videoBuffer, {
              contentType: mimeType,
              upsert: true,
            });

          if (uploadError) throw uploadError;
        },
        STORAGE_UPLOAD_TIMEOUT_MS,
        "Supabase video upload"
      ),
      {
        label: `Shot ${shotIndex + 1} video upload`,
        attempts: 2,
        baseDelayMs: 900,
      }
    );

    const { data: { publicUrl } } = supabase.storage.from("assets").getPublicUrl(storagePath);

    return NextResponse.json({
      success: true,
      video_url: publicUrl,
      video_path: storagePath,
      video_width: videoDimensions.width,
      video_height: videoDimensions.height,
      video_aspect_ratio: videoDimensions.aspectRatio,
      operation: completedOperation.name,
      shot: {
        ...normalizedShot,
        p: normalizedShot.p,
        video_url: publicUrl,
        video_path: storagePath,
        video_prompt: compact(selectedVideoPrompt, 6400),
        video_prompt_audio_safe_retry: usedAudioSafePrompt,
        video_model: videoGeneration.model,
        veo_duration_seconds: requestConfig.durationSeconds,
        video_duration_seconds: requestConfig.durationSeconds,
        video_operation: completedOperation.name || null,
        video_source_image_used: sourceImageWasUsed,
        video_source_image_width: sourceImageDimensions?.width || null,
        video_source_image_height: sourceImageDimensions?.height || null,
        video_width: videoDimensions.width,
        video_height: videoDimensions.height,
        video_aspect_ratio: videoDimensions.aspectRatio,
        video_generated_at: new Date().toISOString(),
        video_error: null,
      },
    });
  } catch (error) {
    const serialized = serializeError(error);
    console.error("Shot Video Generation API Error:", serialized);
    const status = Number(serialized.status);
    return NextResponse.json(
      {
        error: serialized.message,
        retryable: serialized.retryable,
        status: serialized.status,
      },
      { status: status >= 400 && status <= 599 ? status : (serialized.retryable ? 503 : 500) }
    );
  } finally {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
