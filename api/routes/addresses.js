const express = require('express');

const router = express.Router();

const addressStore = {};

router.get('/:customerId', (req, res) => {
  const { customerId } = req.params;
  const addresses = addressStore[customerId] || [];
  res.json({ addresses });
});

router.post('/:customerId', (req, res) => {
  const { customerId } = req.params;
  const { address } = req.body;

  if (!address || !address.prefecture || !address.city || !address.street) {
    return res.status(400).json({
      error: 'address must have prefecture, city, and street',
    });
  }

  if (!addressStore[customerId]) {
    addressStore[customerId] = [];
  }

  const id = Date.now().toString();
  const newAddress = {
    id,
    ...address,
    createdAt: new Date().toISOString(),
  };

  addressStore[customerId].push(newAddress);
  res.json(newAddress);
});

router.put('/:customerId/:addressId', (req, res) => {
  const { customerId, addressId } = req.params;
  const { address } = req.body;

  if (!addressStore[customerId]) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  const idx = addressStore[customerId].findIndex(a => a.id === addressId);
  if (idx === -1) {
    return res.status(404).json({ error: 'Address not found' });
  }

  addressStore[customerId][idx] = {
    ...addressStore[customerId][idx],
    ...address,
    updatedAt: new Date().toISOString(),
  };

  res.json(addressStore[customerId][idx]);
});

router.delete('/:customerId/:addressId', (req, res) => {
  const { customerId, addressId } = req.params;

  if (!addressStore[customerId]) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  const idx = addressStore[customerId].findIndex(a => a.id === addressId);
  if (idx === -1) {
    return res.status(404).json({ error: 'Address not found' });
  }

  addressStore[customerId].splice(idx, 1);
  res.json({ success: true });
});

module.exports = router;
