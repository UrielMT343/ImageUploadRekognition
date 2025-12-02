import type { NextConfig } from "next";

const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;
const AWS_REGION = process.env.APP_AWS_REGION;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: `${S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com`,
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
