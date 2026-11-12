/**
 * ============================================================
 * CBT BAHASA — Aggregator Layanan Bisnis (Services Aggregator)
 * ============================================================
 */

const common = require('./common');
const examService = require('./examService');
const bankService = require('./bankService');
const userService = require('./userService');
const reportService = require('./reportService');

module.exports = {
  ...common,
  ...examService,
  ...bankService,
  ...userService,
  ...reportService
};
