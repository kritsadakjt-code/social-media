export const PostCommentedSchema = {
  type: 'record',
  name: 'PostCommentEvent',
  namespace: 'com.social.post',
  fields: [
    { name: 'postId', type: 'string' },
    { name: 'postOwnerId', type: 'string' },
    { name: 'commenterId', type: 'string' },
    { name: 'commenterName', type: 'string' },
    { name: 'content', type: 'string' },
    { name: 'timestamp', type: 'string' },
  ],
};
