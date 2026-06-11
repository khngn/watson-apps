import type { UpdateFunctionCodeCommandInput } from '@aws-sdk/client-lambda';
import type {
  CopyObjectCommandInput,
  DeleteObjectCommandInput,
  GetObjectCommandInput,
  HeadObjectCommandOutput,
  PutObjectCommandInput,
  PutObjectCommandOutput,
} from '@aws-sdk/client-s3';

export interface UpdateFunctionCodeAndVersionRequest {
  UpdateFunctionCodeCommandInput: UpdateFunctionCodeCommandInput,
  waitUntilFunctionUpdated?: {
    /**
     * The amount of time in seconds a user is willing to wait for a waiter to complete.
     */
    maxWaitTime: number;
    // If provided, the function will be published as a new version after the code update
    publishNewVersion?: {
      // If provided, the specified alias will be updated to point to the new version published after the code update.
      updateAliasName?: string,
    },
  }
}

export interface GetS3ObjectRequest {
  GetObjectCommandInput: GetObjectCommandInput,
  // The number of seconds before the presigned URL expires. Defaults to 3600 (1 hour).
  expiresIn?: number,
}

export interface GetS3ObjectResponse {
  HeadObjectCommandOutput: HeadObjectCommandOutput,
  signedUrl: string,
}

export interface TransferS3ObjectRequest {
  CopyObjectCommandInput: CopyObjectCommandInput,
  onSuccess?: {
    DeleteObjectCommandInput?: DeleteObjectCommandInput,
  },
}

export interface PutS3ObjectRequest {
  PutObjectCommandInput: PutObjectCommandInput,
  isBase64Payload?: {
    isGzip?: boolean,
  },
  // Used when no Body is provided and the caller wants to generate a presigned URL for uploading the object directly to S3.
  generateSignedUrl?: {
    // The number of seconds before the presigned URL expires. Defaults to 3600 (1 hour).
    expiresIn?: number,
  },
}

export type PutS3ObjectResponse = PutObjectCommandOutput | {
  signedUrl: string,
}