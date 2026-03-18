const configFile = require('./config');
const config = configFile.metrics
const os = require('os');

// Metrics stored in memory
const requests = {};
let successfulAuthCount = 0;
let failedAuthCount = 0;
let currentCpuUsage = 0;
let pizzasSoldCount = 0;
let failedPurchaseCount = 0;
let bitcoinProfitCount = 0;
let activeUsers = {};
let latencies = [];
let pizzaLatencies = [];

function markSuccessfulAuth(){
    successfulAuthCount++;
}

function markFailedAuth(){
    failedAuthCount++;
}

function markPizzaSold(){
  pizzasSoldCount++;
}

function markFailedPurchase(){
  failedPurchaseCount++;
}

function moneyCounter(purchaseItems){
  let purchaseTotal = 0;
  purchaseItems.forEach((item) => {
    purchaseTotal += item.price
  })
  bitcoinProfitCount += purchaseTotal;
}

const getCpuStats = () => {
  const cpus = os.cpus();
  let idle = 0, total = 0;
  cpus.forEach(cpu => {
    for (let type in cpu.times) total += cpu.times[type];
    idle += cpu.times.idle;
  });
  return { idle, total };
};

// Initialize the first snapshot
let lastStats = getCpuStats();


setInterval(() => {
  const currentStats = getCpuStats();

  const idleDiff = currentStats.idle - lastStats.idle;
  const totalDiff = currentStats.total - lastStats.total;

  if (totalDiff > 0) {
    const usage = 100 - (100 * idleDiff / totalDiff);
    // Update your local variable as a clean Number
    currentCpuUsage = Number(usage.toFixed(2));
  }

  // Store current stats as "lastStats" for the next interval calculation
  lastStats = currentStats;
}, 9000); // Updates every 2 seconds

function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsage = (usedMemory / totalMemory) * 100;
  return memoryUsage.toFixed(2);
}

//MiddleWare to check when a user makes a request
function activeUserTracker(req, res, next){
  if (req.body.email){
    activeUsers[req.body.email] = Date.now();
  }
  next();
}

//every 5 minutes, take out every active user that didn't have a request fulfilled within the last 5 minutes
setInterval(() => {
  let updatedActiveUsers = {}
  Object.keys(activeUsers).forEach((user) => {
    if (user.requestTime >= (Date.now() - 300000)){
      updatedActiveUsers.push(user);
    }
  })
  activeUsers = updatedActiveUsers;
}, 300000)

// Middleware to track requests
function requestTracker(req, res, next) {
  const endpoint = `${req.method}`;
  requests[endpoint] = (requests[endpoint] || 0) + 1;
  next();
}

//Middleware to measure request latancy
function latencyTracker(req, res, next){
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const durationInMs = Number(end - start) / 1000000;
    latencies.push(durationInMs);
  });
    next();
};

//Middleware used specifically to measure pizza selling latency
function pizzaLatencyTracker(req, res, next){
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const durationInMs = Number(end - start) / 1000000;
    pizzaLatencies.push(durationInMs);
  });
    next();
}

// This will periodically send metrics to Grafana
setInterval(() => {
  const metrics = [];
  Object.keys(requests).forEach((endpoint) => {
    metrics.push(createMetric('requests', requests[endpoint], '1', 'sum', 'asInt', { endpoint }));
  });
  
  metrics.push(createMetric('authSuccess', successfulAuthCount, '1', 'sum', 'asInt', {}));
  metrics.push(createMetric('authFail', failedAuthCount, '1', 'sum', 'asInt', {}));
  metrics.push(createMetric('pizzaSold', pizzasSoldCount, '1', 'sum', 'asInt', {}));
  metrics.push(createMetric('failedPurchases', failedPurchaseCount, '1', 'sum', 'asInt', {}));
  metrics.push(createMetric('bitcoinRevenue', bitcoinProfitCount, 'BTC', 'sum', 'asDouble', {}));
  metrics.push(createMetric('activeUsers', Object.keys(activeUsers).length, '1', 'sum', 'asInt', {}));
  metrics.push(createMetric('cpuUsage', parseInt(currentCpuUsage), '%', 'gauge', 'asInt', {}));
  metrics.push(createMetric('memoryUsage', parseInt(getMemoryUsagePercentage()), '%', 'gauge', 'asInt', {}));
  if (latencies.length > 0){
    let avgLatency = latencies.reduce((acc, curr) => acc + curr, 0) / latencies.length
    metrics.push(createMetric('averageLatency', avgLatency, 'ms', 'gauge', 'asDouble', {}));
    latencies = [];
  }
  if (pizzaLatencies.length > 0){
    let avgPizzaLatency = pizzaLatencies.reduce((acc, curr) => acc + curr, 0) / pizzaLatencies.length
    metrics.push(createMetric('averagePizzaLatency', avgPizzaLatency, 'ms', 'gauge', 'asDouble', {}));
    pizzaLatencies = [];
  }
  sendMetricToGrafana(metrics);
  
}, 10000);

function createMetric(metricName, metricValue, metricUnit, metricType, valueType, attributes) {
  attributes = { ...attributes, source: config.source };

  const metric = {
    name: metricName,
    unit: metricUnit,
    [metricType]: {
      dataPoints: [
        {
          [valueType]: metricValue,
          timeUnixNano: Date.now() * 1000000,
          attributes: [],
        },
      ],
    },
  };

  Object.keys(attributes).forEach((key) => {
    metric[metricType].dataPoints[0].attributes.push({
      key: key,
      value: { stringValue: attributes[key] },
    });
  });

  if (metricType === 'sum') {
    metric[metricType].aggregationTemporality = 'AGGREGATION_TEMPORALITY_CUMULATIVE';
    metric[metricType].isMonotonic = true;
  }

  return metric;
}

function sendMetricToGrafana(metrics) {
  const body = {
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics,
          },
        ],
      },
    ],
  };

  fetch(`${config.endpointUrl}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { Authorization: `Bearer ${config.accountId}:${config.apiKey}`, 'Content-Type': 'application/json' },
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP status: ${response.status}`);
      }
    })
    .catch((error) => {
      console.error('Error pushing metrics:', error);
    });
}

//Exporting to service
//Abra cadabra
module.exports = {requestTracker, activeUserTracker, latencyTracker, pizzaLatencyTracker, markSuccessfulAuth, markFailedAuth, markPizzaSold, markFailedPurchase, moneyCounter}