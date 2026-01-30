const request = require('supertest');
const app = require('./service');
const { DB, Role } = require('./database/database.js')

let testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
let userId;
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
  userId = registerRes.body.user.id;
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
  userId = meRes.body.id;

  const newUser = { name: 'pizza lover', email: Math.random().toString(36).substring(2, 12) + '@test.com', password: 'b' };
  testUser = newUser;
  
  const updateRes = await request(app).put(`/api/user/${userId}`).set('Authorization', `Bearer ${testUserAuthToken}`).send(newUser);
  expect(updateRes).toBeDefined();
  expect(updateRes.body.user.name).toBe(newUser.name)

});

test('test franchise', async () => {
  //create admin user to register franchise under
  await createAdminUser();
  //register franchise under new admin
  const franchiseName = randomName();
  const franchiseRes = await request(app).post('/api/franchise').set('Authorization', `Bearer ${testAdminAuthToken}`).send({name: franchiseName, admins: [{email: testUser.email}]})
  expect(franchiseRes.body.name.length).toEqual(franchiseName.length);
  expect(franchiseRes.body.admins[0].email).toBe(testUser.email)

  //check to see that getting the franchise list contains the newly added franchise
  let myFranchise = await request(app).get(`/api/franchise/${userId}`).set('Authorization', `Bearer ${testUserAuthToken}`).send();
  expect(myFranchise.body[0].name.length).toBe(franchiseName.length);
  expect(myFranchise.body[0].admins[0].name).toBe(testUser.name);
  const myFranchiseId = myFranchise.body[0].id;

  //now create a new store in that verified franchise
  const storeName = randomName();
  const testStore = {franchiseId: myFranchiseId, name: storeName};
  const storeRes = await request(app).post(`/api/franchise/${myFranchiseId}/store`).set('Authorization', `Bearer ${testUserAuthToken}`).send(testStore)
  expect(storeRes.body.name).toBe(storeName);
  const storeId = storeRes.body.id;

  //delete store, verify that store can no longer be fetched with userId
  const deleteStoreRes = await request(app).delete(`/api/franchise/${myFranchiseId}/store/${storeId}`).set('Authorization', `Bearer ${testUserAuthToken}`).send();
  expect(deleteStoreRes.body.message).toBeDefined();
  myFranchise = await request(app).get(`/api/franchise/${userId}`).set('Authorization', `Bearer ${testUserAuthToken}`).send();
  expect(myFranchise.body[0].stores.length).toBe(0);

  //delete franchise, verify franchise is no longer linked to the userId
  const deleteFranchiseRes = await request(app).delete(`/api/franchise/${myFranchiseId}`).set('Authorization', `Bearer ${testAdminAuthToken}`).send();
  expect(deleteFranchiseRes.body.message).toBeDefined();
  myFranchise = await request(app).get(`/api/franchise/${userId}`).set('Authorization', `Bearer ${testUserAuthToken}`).send();
  expect(myFranchise.body.length).toBe(0);

})

test('menu and orders', async () => {
  //receiving the menu
  const menuRes = await request(app).get('/api/order/menu').send();
  expect(menuRes.body).toBeDefined();

  //adding to the menu
  await createAdminUser();
  const menu = menuRes.body;
  const itemName = randomName();
  const newItem = {title: itemName, description: 'yummy', image: 'fakeimage.png', price: '0.0002'}
  const newMenu = await request(app).put('/api/order/menu').set('Authorization', `Bearer ${testAdminAuthToken}`).send(newItem);
  expect(newMenu.body).not.toMatchObject(menu);
  expect(newMenu.body[newMenu.body.length - 1].title).toBe(itemName);

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






