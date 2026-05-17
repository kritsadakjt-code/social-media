export const MediaUploadedSchema = {
  type: 'record',
  name: 'MediaUploadedEvent',
  namespace: 'com.social.media',
  fields: [
    { name: 'mediaId', type: 'string' },
    { name: 'userId', type: 'string' },
    { name: 'key', type: 'string' },
    { name: 'fileType', type: 'string' },
    { name: 'purpose', type: 'string' },
  ],
};
