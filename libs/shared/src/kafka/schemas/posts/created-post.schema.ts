// สร้างสัญญา
export const PostCreatedSchema = {
  type: 'record',
  name: 'PostCreatedEvent',
  namespace: 'com.social.post',
  fields: [
    { name: 'postId', type: 'string' },
    { name: 'authorId', type: 'string' },
    { name: 'content', type: 'string' },
    { name: 'timestamp', type: 'string' },
    { name: 'imageUrl', type: ['null', 'string'], default: null },
    // { name: 'imageUrl2', type: ['null', 'string'], default: null },
  ],
};
