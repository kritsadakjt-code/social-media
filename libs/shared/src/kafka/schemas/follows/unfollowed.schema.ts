export const UnfollowedSchema = {
  type: 'record',
  name: 'UnfollowedEvent',
  namespace: 'com.social.follow',
  fields: [
    { name: 'followerId', type: 'string' },
    { name: 'followingId', type: 'string' },
  ],
};
