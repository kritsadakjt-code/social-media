// avro format
export const MediaProcessFailedSchema = {
  type: 'record',
  name: 'MediaProcessFailedEvent',
  namespace: 'com.social.media',
  fields: [
    { name: 'mediaId', type: 'string' },
    { name: 'userId', type: 'string' },
    { name: 'purpose', type: 'string' },
    { name: 'errorMessage', type: 'string' },
    { name: 'failedAt', type: 'string' },
  ],
};
