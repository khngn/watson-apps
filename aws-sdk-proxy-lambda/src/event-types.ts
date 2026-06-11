import { S3Event, S3EventRecord, SQSEvent, SQSRecord } from "aws-lambda";

export const isSQSEvent = (event: unknown): event is SQSEvent => {
  if (!event || typeof event !== 'object') return false;

  const it = event as Partial<SQSEvent>;
  if (!Array.isArray(it.Records) || it.Records.length === 0) return false;

  const isSQSRecord = (record: unknown): record is SQSRecord => {
    if (!record || typeof record !== 'object') return false;
    const rec = record as Partial<SQSRecord>;
    return rec.eventSource === 'aws:sqs' && typeof rec.body === 'string';
  };

  return it.Records.every(isSQSRecord);
}

export const isS3Event = (event: unknown): event is S3Event => {
  if (!event || typeof event !== 'object') return false;
  const it = event as Partial<S3Event>;
  if (!Array.isArray(it.Records) || it.Records.length === 0) return false;

  const isS3EventRecord = (record: unknown): record is S3EventRecord => {
    if (!record || typeof record !== 'object') return false;
    const rec = record as Partial<S3EventRecord>;
    return rec.eventSource === 'aws:s3' && typeof rec.s3?.bucket?.name === 'string' && typeof rec.s3?.object?.key === 'string';
  };

  return it.Records.every(isS3EventRecord);
}
