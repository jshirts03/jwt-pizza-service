const request = require('supertest');
const app = require('./service');
const { DB, Role } = require('./database/database.js')

const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
let testUserAuthToken;
let testAdminAuthToken;
let admin;

if (process.env.VSCODE_INSPECTOR_OPTIONS) {
  jest.setTimeout(60 * 1000 * 5); // 5 minutes
}

beforeAll(async () => {
  testUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';
  const registerRes = await request(app).post('/api/auth').send(testUser);
  testUserAuthToken = registerRes.body.token;
});

function randomName() {
  return "Pizza" + Math.random().toString(36).substring(2, 12);
}

async function createAdminUser() {
  let user = { password: 'hi', roles: [{ role: Role.Admin }] };
  user.name = randomName();
  user.email = user.name + '@admin.com';

  await DB.addUser(user);
  user.password = 'hi';
  const loginToken = (await request(app).put('/api/auth').send(user)).body.token;
  testAdminAuthToken = loginToken;
  admin = user;
}


test('login', async () => {
  const loginRes = await request(app).put('/api/auth').send(testUser);
  expect(loginRes.status).toBe(200);
  expect(loginRes.body.token).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);

  // The ... crams all the properties of testUser into a new object, with an assumed role
  // Then we remove the password property for comparison, meaning we create a new object without the password titled "user"
  const { password, ...user } = { ...testUser, roles: [{ role: 'diner' }] };
  expect(loginRes.body.user).toMatchObject(user);
});

//Discovered that it does not support the updating of just your name
//must be a new email, password, etc.
test('update user', async () => {
  const meRes = await request(app).get('/api/user/me').set('Authorization', `Bearer ${testUserAuthToken}`).send();
  const userId = meRes.body.id;

  const newUser = { name: 'pizza lover', email: Math.random().toString(36).substring(2, 12) + '@test.com', password: 'b' };

  
  const updateRes = await request(app).put(`/api/user/${userId}`).set('Authorization', `Bearer ${testUserAuthToken}`).send(newUser);
  expect(updateRes).toBeDefined();
  expect(updateRes.body.user.name).toBe(newUser.name)

});

test('add franchise', async () => {
  await createAdminUser();
  const franchiseName = randomName();
  const franchiseRes = await request(app).post('/api/franchise').set('Authorization', `Bearer ${testAdminAuthToken}`).send({name: franchiseName, admins: [{email: admin.email}]})
  expect(franchiseRes.body.name).toBe(franchiseName);
  expect(franchiseRes.body.admins[0].email).toBe(admin.email)
})

test('logout', async () => {
  const logoutRes = await request(app).delete('/api/auth').set('Authorization', `Bearer ${testUserAuthToken}`).send();
  expect(logoutRes.status).toBe(200);
  expect(logoutRes.body.message).toBe('logout successful');

  // After logout the same token should no longer grant access to protected endpoints
  const meRes = await request(app).get('/api/user/me').set('Authorization', `Bearer ${testUserAuthToken}`).send();
  expect(meRes.status).toBe(401);
  expect(meRes.body.message).toBe('unauthorized');
})






