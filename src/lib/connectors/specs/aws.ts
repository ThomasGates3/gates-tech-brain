import type { Connector } from "@/lib/types";

export const aws: Connector = {
  id: "aws",
  label: "AWS",
  auth: "aws_sig",
  baseUrl: "https://monitoring.us-east-1.amazonaws.com", // CloudWatch as default; Tool Router uses service-specific URLs
  credential: {
    vaultKey: "AWS_CREDENTIALS", // JSON: { accessKeyId, secretAccessKey, region }
    scopes: ["cloudwatch:GetMetricStatistics", "cloudwatch:ListMetrics", "s3:ListBuckets"],
  },
  rateLimit: { requests: 20, perSeconds: 1 },
  enabled: true,
  tools: [
    {
      name: "list_metrics",
      description: "List available CloudWatch metrics for a namespace",
      method: "POST",
      path: "/?Action=ListMetrics",
      risk: "read",
      params: {
        Namespace: { type: "string", in: "body", description: "AWS namespace e.g. AWS/EC2" },
      },
    },
    {
      name: "get_metric_statistics",
      description: "Fetch CloudWatch metric data over a time period",
      method: "POST",
      path: "/?Action=GetMetricStatistics",
      risk: "read",
      params: {
        Namespace: { type: "string", required: true, in: "body" },
        MetricName: { type: "string", required: true, in: "body" },
        StartTime: { type: "string", required: true, in: "body", description: "ISO 8601" },
        EndTime: { type: "string", required: true, in: "body", description: "ISO 8601" },
        Period: { type: "number", required: true, in: "body", description: "Seconds" },
        Statistics: { type: "array", required: true, in: "body", description: "e.g. [Sum, Average]" },
      },
    },
    {
      name: "list_s3_buckets",
      description: "List all S3 buckets in the AWS account",
      method: "GET",
      path: "/",
      risk: "read",
      params: {},
    },
  ],
};
