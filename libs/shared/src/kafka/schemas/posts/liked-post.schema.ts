// สร้างสัญญา
export const PostLikedSchema = {
  type: 'record',
  name: 'PostLikedEvent',
  namespace: 'com.social.post',
  fields: [
    { name: 'postId', type: 'string' },
    { name: 'postOwnerId', type: 'string' },
    { name: 'likedByUserId', type: 'string' },
    { name: 'timestamp', type: 'string' },
  ],
};
