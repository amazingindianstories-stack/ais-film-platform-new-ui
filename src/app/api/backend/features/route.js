import { BACKEND_FEATURES, FEATURE_STATUSES } from "@/lib/backendCatalog";

export function GET() {
  return Response.json({
    statuses: FEATURE_STATUSES,
    features: BACKEND_FEATURES,
  });
}
