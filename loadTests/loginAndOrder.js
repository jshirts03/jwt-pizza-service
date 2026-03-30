import { sleep, check, fail } from 'k6'
import http from 'k6/http'
import jsonpath from 'https://jslib.k6.io/jsonpath/1.0.2/index.js'

export const options = {
  cloud: {
    distribution: { 'amazon:us:ashburn': { loadZone: 'amazon:us:ashburn', percent: 100 } },
    apm: [],
  },
  thresholds: {},
  scenarios: {
    Imported_HAR: {
      executor: 'ramping-vus',
      gracefulStop: '30s',
      stages: [
        { target: 20, duration: '10s' },
        { target: 50, duration: '20s' },
        { target: 30, duration: '15s' },
        { target: 0, duration: '10s' },
      ],
      gracefulRampDown: '30s',
      exec: 'imported_HAR',
    },
  },
}

export function imported_HAR() {
  let response

  const vars = {}

  // Login
  response = http.put(
    'https://pizza-service.heypizza.click/api/auth',
    '{"email":"d@jwt.com","password":"diner"}',
    {
      headers: {
        'sec-ch-ua-platform': '"Windows"',
        'sec-ch-ua': '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
        'Content-Type': 'application/json',
        'sec-ch-ua-mobile': '?0',
      },
    }
  )
  check(response, { 'status equals 200': response => response.status.toString() === '200' })

  if (!check(response, { '200': response => response.status.toString() === '200' })) {
	  console.log(response.body);
    fail('Login was *not* 200');
  }
  else{
    console.log("user login successful")
  }


  vars['token'] = jsonpath.query(response.json(), '$.token')[0]

  sleep(3)

  // Get Menu
  response = http.get('https://pizza-service.heypizza.click/api/order/menu', {
    headers: {
      'sec-ch-ua-platform': '"Windows"',
      Authorization: `Bearer ${vars['token']}`,
      'sec-ch-ua': '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
      'Content-Type': 'application/json',
      'sec-ch-ua-mobile': '?0',
    },
  })

  // Get Franchise
  response = http.get('https://pizza-service.heypizza.click/api/franchise?page=0&limit=20&name=*', {
    headers: {
      'sec-ch-ua-platform': '"Windows"',
      Authorization: `Bearer ${vars['token']}`,
      'sec-ch-ua': '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
      'Content-Type': 'application/json',
      'sec-ch-ua-mobile': '?0',
    },
  })
  sleep(1)

  // Get User
  response = http.get('https://pizza-service.heypizza.click/api/user/me', {
    headers: {
      'sec-ch-ua-platform': '"Windows"',
      Authorization: `Bearer ${vars['token']}`,
      'sec-ch-ua': '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
      'Content-Type': 'application/json',
      'sec-ch-ua-mobile': '?0',
    },
  })
  sleep(2)

  // Buy pizzas
  response = http.post(
    'https://pizza-service.heypizza.click/api/order',
    '{"items":[{"menuId":1,"description":"Veggie","price":0.0038},{"menuId":2,"description":"Pepperoni","price":0.0042},{"menuId":4,"description":"Crusty","price":0.0028},{"menuId":4,"description":"Crusty","price":0.0028}],"storeId":"1","franchiseId":1}',
    {
      headers: {
        'sec-ch-ua-platform': '"Windows"',
        Authorization: `Bearer ${vars['token']}`,
        'sec-ch-ua': '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
        'Content-Type': 'application/json',
        'sec-ch-ua-mobile': '?0',
      },
    }
  )
  check(response, { 'status equals 200': response => response.status.toString() === '200' })

  if (!check(response, { '200': response => response.status.toString() === '200' })) {
	  console.log(response.body);
    fail('Purchase was *not* 200');
  }
  else{
    console.log("pizza purchase successful")
  }

  vars['jwt'] = jsonpath.query(response.json(), '$.jwt')[0]

  sleep(1)
  //Make sure you store the jwt token as a variable and replace this hardcoded value on line 114

  // Verify JWT
  response = http.post(
    'https://pizza-factory.cs329.click/api/order/verify',
    `{"jwt": "${vars['jwt']}"}`,
    {
      headers: {
        'sec-ch-ua-platform': '"Windows"',
        Authorization: `Bearer ${vars['token']}`,
        'sec-ch-ua': '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
        'Content-Type': 'application/json',
        'sec-ch-ua-mobile': '?0',
      },
    }
  )

  
}