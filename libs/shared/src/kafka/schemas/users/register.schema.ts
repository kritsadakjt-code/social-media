export const UserRegisteredSchema = {
  type: 'record',
  name: 'UserRegisteredEvent',
  namespace: 'com.social.user',
  fields: [
    { name: 'userId', type: 'string' },
    { name: 'username', type: 'string' },
    { name: 'email', type: 'string' },
  ],
};
