import { DecryptCommandInput, DecryptCommandOutput, EncryptCommandInput, EncryptCommandOutput, UpdateAliasCommandOutput } from '@aws-sdk/client-kms/dist-types/commands/index.js';
import type { ListAliasesCommandOutput, PublishVersionCommandOutput, UpdateFunctionCodeCommandInput, UpdateFunctionCodeCommandOutput } from '@aws-sdk/client-lambda';
import type {
  CopyObjectCommandInput,
  CopyObjectCommandOutput,
  DeleteObjectCommandInput,
  DeleteObjectCommandOutput,
  GetObjectCommandInput,
  HeadObjectCommandOutput,
  PutObjectCommandInput,
  PutObjectCommandOutput,
} from '@aws-sdk/client-s3';

// ##############################################################
// Lambda Function
// ##############################################################
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

export interface UpdateFunctionCodeAndVersionResponse {
  UpdateFunctionCodeCommandOutput: UpdateFunctionCodeCommandOutput,
  PublishVersionCommandOutput?: PublishVersionCommandOutput,
  UpdateAliasCommandOutput?: UpdateAliasCommandOutput,
}

// ##############################################################
// S3
// ##############################################################
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

export interface TransferS3ObjectResponse {
  CopyObjectCommandOutput: CopyObjectCommandOutput,
  DeleteObjectCommandOutput?: DeleteObjectCommandOutput,
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

export function isPutS3ObjectSignedUrlResponse(
  response: PutS3ObjectResponse,
): response is { signedUrl: string } {
  return 'signedUrl' in response && typeof response.signedUrl === 'string';
}

// ##############################################################
// KMS
// ##############################################################
export interface DecryptKmsRequest {
  textBase64: string,
  listKmsKeyAliases?: boolean,
  DecryptCommandInput?: DecryptCommandInput,
}

export interface DecryptKmsResponse {
  decryptedText: string,
  DecryptCommandOutput: DecryptCommandOutput,
  ListAliasesCommandOutput?: ListAliasesCommandOutput,
}

export interface EncryptKmsRequest {
  text: string,
  EncryptCommandInput: EncryptCommandInput,
}

export interface EncryptKmsResponse {
  encryptedText: string,
  EncryptCommandOutput: EncryptCommandOutput,
}
