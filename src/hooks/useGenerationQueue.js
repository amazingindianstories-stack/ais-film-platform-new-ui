'use client';

import { useState, useRef, useCallback, useMemo } from 'react';

const MAX_RETRIES = 2;
const RETRY_BASE_MS = 2500; // 2.5s → 5s exponential

/**
 * Concurrent job queue with per-job retry and abort.
 *
 * Each job is { id?, label, run: () => Promise<any> }.
 * Jobs proceed concurrently up to `concurrency`.
 * On 429 / 5xx / quota/rate errors the job is retried up to MAX_RETRIES times
 * with exponential back-off before being marked failed.
 *
 * Calling abort() cancels all pending jobs; running jobs finish normally.
 * Calling clear() resets the list (only safe when !isActive).
 */
export function useGenerationQueue({ concurrency = 2 } = {}) {
  const [jobs, setJobs] = useState([]);
  const [isActive, setIsActive] = useState(false);

  // Processing state kept in refs so the tick function never sees stale closures.
  const pendingRef = useRef([]);      // jobs not yet started
  const runningRef = useRef(0);        // count of currently running jobs
  const abortRef = useRef(false);
  const concurrencyRef = useRef(concurrency);
  concurrencyRef.current = concurrency;

  // patchJob is stable (only uses setJobs).
  const patchJob = useCallback((id, patch) => {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...patch } : j));
  }, []);

  // tickRef always holds the LATEST tick function so recursive calls never capture
  // a stale version. This is the standard "ref callback" pattern for recursive async.
  const tickRef = useRef(null);
  tickRef.current = async function tick() {
    if (abortRef.current) return;
    if (runningRef.current >= concurrencyRef.current) return;
    if (!pendingRef.current.length) {
      if (runningRef.current === 0) setIsActive(false);
      return;
    }

    const job = pendingRef.current.shift();
    runningRef.current++;
    patchJob(job.id, { status: 'running' });

    let retries = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const result = await job.run();
        patchJob(job.id, { status: 'done', result });
        break;
      } catch (err) {
        if (abortRef.current) {
          patchJob(job.id, { status: 'cancelled' });
          break;
        }
        const msg = String(err?.message || err || '');
        const canRetry =
          retries < MAX_RETRIES &&
          (err?.status === 429 ||
            err?.status >= 500 ||
            /quota|rate.?limit|overload|unavailable|server.?error/i.test(msg));

        if (canRetry) {
          retries++;
          const delay = RETRY_BASE_MS * Math.pow(2, retries - 1); // 2.5s, 5s
          patchJob(job.id, { status: 'retrying', retryCount: retries, error: msg });
          await new Promise(r => setTimeout(r, delay));
          if (abortRef.current) {
            patchJob(job.id, { status: 'cancelled' });
            break;
          }
        } else {
          patchJob(job.id, { status: 'failed', error: msg });
          break;
        }
      }
    }

    runningRef.current--;
    tickRef.current(); // kick off next waiting job
  };

  /**
   * Add jobs to the queue and start processing.
   * Jobs already in the queue are not affected.
   * @param {{ id?: string, label: string, run: () => Promise<any> }[]} newJobs
   * @returns {object[]} The stamped job descriptors (without run).
   */
  const enqueue = useCallback((newJobs) => {
    if (!newJobs?.length) return [];
    abortRef.current = false;

    const stamped = newJobs.map(j => ({
      id: j.id ?? `job-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      label: j.label ?? 'Generating…',
      run: j.run,
      status: 'pending',
      error: null,
      result: null,
      retryCount: 0,
    }));

    setJobs(prev => [...prev, ...stamped]);
    pendingRef.current.push(...stamped);
    setIsActive(true);

    // Kick off up to concurrency workers immediately.
    const slots = Math.min(concurrencyRef.current, stamped.length);
    for (let i = 0; i < slots; i++) tickRef.current();

    return stamped;
  }, []);

  /** Cancel all pending jobs. Already-running jobs complete normally. */
  const abort = useCallback(() => {
    abortRef.current = true;
    pendingRef.current = [];
    setIsActive(false);
    setJobs(prev =>
      prev.map(j => j.status === 'pending' ? { ...j, status: 'cancelled' } : j)
    );
  }, []);

  /** Remove all jobs from the list. Only safe when !isActive. */
  const clear = useCallback(() => {
    if (runningRef.current > 0) return;
    setJobs([]);
    pendingRef.current = [];
    runningRef.current = 0;
    setIsActive(false);
  }, []);

  const stats = useMemo(() => {
    const s = {
      total: jobs.length,
      pending: 0,
      running: 0,
      retrying: 0,
      done: 0,
      failed: 0,
      cancelled: 0,
    };
    for (const j of jobs) if (j.status in s) s[j.status]++;
    s.finished = s.done + s.failed + s.cancelled;
    return s;
  }, [jobs]);

  return { jobs, isActive, stats, enqueue, abort, clear };
}
