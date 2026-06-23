require('dotenv').config({ path: ['.env.local', '.env'] });
const express = require('express');
const cors = require('cors');
const shippingCalculate = require('./api/routes/shipping-calculate');
const addresses = require('./api/routes/addresses');
const products = require('./api/routes/products');
const orders = require('./api/routes/orders');

const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/shipping-calculate', shippingCalculate);
app.use('/api/addresses', addresses);
app.use('/api/products', products);
app.use('/api/orders', orders);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`BigCommerce API server running on port ${PORT}`);
});
