export const MediaProcessedSchema = {
  type: 'record',
  name: 'MediaProcessedEvent',
  namespace: 'com.social.media',
  fields: [
    { name: 'mediaId', type: 'string' },
    { name: 'userId', type: 'string' },
    { name: 'purpose', type: 'string' },
    { name: 'originalUrl', type: 'string' },
    { name: 'thumbnailUrl', type: ['null', 'string'], default: null },
    { name: 'mediumUrl', type: ['null', 'string'], default: null },
    { name: 'p360Url', type: ['null', 'string'], default: null },
    { name: 'p720Url', type: ['null', 'string'], default: null },
    { name: 'p1080Url', type: ['null', 'string'], default: null },
  ],
};
