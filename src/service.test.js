const request = require('supertest');
const app = require('./service');
const { DB, Role } = require('./database/database.js')
const bcrypt = require('bcrypt');

let testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
let userId;
let testUserAuthToken;
let testAdminAuthToken;

if (process.env.VSCODE_INSPECTOR_OPTIONS) {
  jest.setTimeout(60 * 1000 * 5); // 5 minutes
}

beforeAll(async () => {
  testUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';
  const registerRes = await request(app).post('/api/auth').send(testUser);
  testUserAuthToken = registerRes.body.token;
  userId = registerRes.body.user.id;
   //create admin user to register franchise under
  await createAdminUser();
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
}


test('login', async () => {
  const loginRes = await request(app).put('/api/auth').send(testUser);
  expect(loginRes.status).toBe(200);
  expect(loginRes.body.token).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);

  // The ... crams all the properties of testUser into a new object, with an assumed role
  // Then we remove the password property for comparison, meaning we create a new object without the password titled "user"
  const { password, ...user } = { ...testUser, roles: [{ role: 'diner' }] };
  expect(loginRes.body).not.toBe(password);
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

test('menu', async () => {
  //receiving the menu
  const menuRes = await request(app).get('/api/order/menu').send();
  expect(menuRes.body).toBeDefined();

  //adding to the menu
  const menu = menuRes.body;
  const itemName = randomName();
  const newItem = {title: itemName, description: 'yummy', image: 'fakeimage.png', price: '0.0002'}
  const newMenu = await request(app).put('/api/order/menu').set('Authorization', `Bearer ${testAdminAuthToken}`).send(newItem);
  expect(newMenu.body).not.toMatchObject(menu);
  expect(newMenu.body[newMenu.body.length - 1].title).toBe(itemName);
})

test('order', async () => {
  //ok so this is not the most efficient, but create a franchise, a store, and a menu item
  const franchiseName = randomName();
  const franchiseRes = await request(app).post('/api/franchise').set('Authorization', `Bearer ${testAdminAuthToken}`).send({name: franchiseName, admins: [{email: testUser.email}]})
  expect(franchiseRes.body.id).toBeDefined();
  const franchiseId = franchiseRes.body.id;

  const storeName = randomName();
  const testStore = {franchiseId: franchiseId, name: storeName};
  const storeRes = await request(app).post(`/api/franchise/${franchiseId}/store`).set('Authorization', `Bearer ${testUserAuthToken}`).send(testStore);
  expect(storeRes.body.id).toBeDefined();
  const storeId = storeRes.body.id;

  const itemName = randomName();
  const newItem = {title: itemName, description: 'yummy', image: 'fakeimage.png', price: '0.0002'}
  const newMenu = await request(app).put('/api/order/menu').set('Authorization', `Bearer ${testAdminAuthToken}`).send(newItem);
  expect(newMenu.body.length).toBeGreaterThan(0);

  // Get the menu to find the item id
  const menuRes = await request(app).get('/api/order/menu').send();
  const menuItem = menuRes.body.find(item => item.title === itemName);
  expect(menuItem).toBeDefined();

  //now actually make an order lol, simulate a call to the jwt token service
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ reportUrl: 'http://fake.url', jwt: 'fake.jwt.token' })
    })
  );

  const orderReq = {
    franchiseId: franchiseId,
    storeId: storeId,
    items: [{ menuId: menuItem.id, description: menuItem.description, price: menuItem.price }]
  };

  const orderRes = await request(app).post('/api/order').set('Authorization', `Bearer ${testUserAuthToken}`).send(orderReq);
  expect(orderRes.status).toBe(200);
  expect(orderRes.body.order).toBeDefined();
  expect(orderRes.body.order.franchiseId).toBe(franchiseId);
  expect(orderRes.body.order.storeId).toBe(storeId);
  expect(orderRes.body.order.items).toHaveLength(1);
  expect(orderRes.body.jwt).toBe('fake.jwt.token');
  expect(orderRes.body.followLinkToEndChaos).toBe('http://fake.url');

  // Verify the order was added to the database
  const ordersRes = await request(app).get('/api/order').set('Authorization', `Bearer ${testUserAuthToken}`).send();
  expect(ordersRes.body.orders).toContainEqual(
    expect.objectContaining({
      franchiseId: franchiseId,
      storeId: storeId,
      items: expect.arrayContaining([
        expect.objectContaining({
          menuId: menuItem.id,
          description: menuItem.description,
          price: menuItem.price
        })
      ])
    })
  );
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


test('order unauthorized', async () => {
  const orderReq = {
    franchiseId: 1,
    storeId: 1,
    items: [{ menuId: 1, description: 'test', price: 0.01 }]
  };
  const orderRes = await request(app).post('/api/order').send(orderReq);
  expect(orderRes.status).toBe(401);
  expect(orderRes.body.message).toBe('unauthorized');
})

test('menu add unauthorized', async () => {
  const newItem = { title: 'Unauthorized Pizza', description: 'should fail', image: 'fake.png', price: 0.001 };
  const menuRes = await request(app).put('/api/order/menu').set('Authorization', `Bearer ${testUserAuthToken}`).send(newItem);
  expect(menuRes.body.message).toBe('unauthorized');
})

async function resetDatabase() {
  const connection = await DB.getConnection();
  try {
    // Delete all orders and order items
    await connection.execute('DELETE FROM orderItem');
    await connection.execute('DELETE FROM dinerOrder');

    // Delete all stores
    await connection.execute('DELETE FROM store');

    // Delete all franchises except SLC
    const [franchisesToDelete] = await connection.execute('SELECT id FROM franchise WHERE name != ?', ['SLC']);
    for (const f of franchisesToDelete) {
      // Delete userRoles for this franchise
      await connection.execute('DELETE FROM userRole WHERE objectId = ?', [f.id]);
      // Delete franchise
      await connection.execute('DELETE FROM franchise WHERE id = ?', [f.id]);
    }

    // Ensure user user@user.com exists
    const [userRows] = await connection.execute('SELECT id FROM user WHERE email = ?', ['user@user.com']);
    let userId;
    if (!userRows.length) {
      const hashedPassword = await bcrypt.hash('user', 10);
      const [res] = await connection.execute('INSERT INTO user (name, email, password) VALUES (?, ?, ?)', ['User', 'user@user.com', hashedPassword]);
      userId = res.insertId;
      await connection.execute('INSERT INTO userRole (userId, role, objectId) VALUES (?, ?, ?)', [userId, 'diner', 0]);
    } else {
      userId = userRows[0].id;
    }

    // Ensure franchise SLC exists
    const [franchiseRows] = await connection.execute('SELECT id FROM franchise WHERE name = ?', ['SLC']);
    let franchiseId;
    if (!franchiseRows.length) {
      const [res] = await connection.execute('INSERT INTO franchise (name) VALUES (?)', ['SLC']);
      franchiseId = res.insertId;
    } else {
      franchiseId = franchiseRows[0].id;
    }

    // Ensure store SLC exists for the franchise
    const [storeRows] = await connection.execute('SELECT id FROM store WHERE franchiseId = ? AND name = ?', [franchiseId, 'SLC']);
    if (!storeRows.length) {
      await connection.execute('INSERT INTO store (franchiseId, name) VALUES (?, ?)', [franchiseId, 'SLC']);
    }

    // Ensure user is Franchisee of SLC
    const [roleRows] = await connection.execute('SELECT * FROM userRole WHERE userId = ? AND role = ? AND objectId = ?', [userId, 'Franchisee', franchiseId]);
    if (!roleRows.length) {
      await connection.execute('INSERT INTO userRole (userId, role, objectId) VALUES (?, ?, ?)', [userId, 'Franchisee', franchiseId]);
    }

    // Ensure admin a@admin.com exists
    const [adminRows] = await connection.execute('SELECT id FROM user WHERE email = ?', ['a@admin.com']);
    if (!adminRows.length) {
      const hashedPassword = await bcrypt.hash('admin', 10);
      const [res] = await connection.execute('INSERT INTO user (name, email, password) VALUES (?, ?, ?)', ['Admin', 'a@admin.com', hashedPassword]);
      const adminId = res.insertId;
      await connection.execute('INSERT INTO userRole (userId, role, objectId) VALUES (?, ?, ?)', [adminId, 'Admin', 0]);
    }

    // Delete extra userRoles
    await connection.execute('DELETE FROM userRole WHERE userId NOT IN (SELECT id FROM user WHERE email IN (?, ?))', ['a@admin.com', 'user@user.com']);

    // Delete extra users
    await connection.execute('DELETE FROM user WHERE email NOT IN (?, ?)', ['a@admin.com', 'user@user.com']);

    // Keep only first 5 menu items
    await connection.execute('DELETE FROM menu WHERE id > 5');

    // Clear auth tokens
    await connection.execute('DELETE FROM auth');
  } finally {
    connection.end();
  }
}

afterAll(async () => {
  await resetDatabase();
});






