// src/controllers/subscriptionOrder.controller.js
const SubscriptionPlan = require("../models/SubscriptionPlan.model");
const SubscriptionOrder = require("../models/SubscriptionOrder.model");
const FleetCompany = require("../models/FleetCompany.model");
const Vehicle = require("../models/Vehicle.model");
const { asyncHandler } = require("../utils/asyncHandler");
const { createApiError } = require("../utils/apiError");

// ==========================================
// 1. INITIATE SUBSCRIPTION ORDER
// POST /api/v1/subscription-orders/create
// ==========================================
const createSubscriptionOrder = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { planId, paymentGateway = "MANUAL" } = req.body;

  // 1. Verify fleet company existence
  const fleetCompany = await FleetCompany.findOne({
    $or: [{ ownerUserId: userId }, { userId }, { ownerId: userId }],
  });

  if (!fleetCompany) {
    throw createApiError(403, "Only registered fleet owners can purchase a subscription plan.");
  }

  // 2. Verify subscription plan existence and active status
  const plan = await SubscriptionPlan.findById(planId);
  if (!plan || !plan.isActive) {
    throw createApiError(404, "Subscription plan is unavailable or currently inactive.");
  }

  // 3. Downgrade Guard: Ensure existing active cars do not exceed new plan limit
  const activeCarsCount = await Vehicle.countDocuments({
    ownerType: "FLEET",
    ownerId: fleetCompany._id,
    status: "ACTIVE",
  });

  if (activeCarsCount > plan.maxCarSlots) {
    throw createApiError(
      400,
      `You currently have ${activeCarsCount} active vehicles. This plan allows a maximum of ${plan.maxCarSlots} vehicles. Please deactivate extra vehicles before purchasing.`
    );
  }

  // 4. Calculate pricing & 18% GST
  const basePrice = plan.price;
  const discountAmount = (basePrice * (plan.discountPercentage || 0)) / 100;
  const finalPrice = Math.round(basePrice - discountAmount);
  const gstAmount = Math.round(finalPrice * 0.18);
  const totalPayable = finalPrice + gstAmount;

  // 5. Generate unique Order ID
  const randomSuffix = Math.floor(10000 + Math.random() * 90000);
  const orderId = `ORD-SUB-${Date.now().toString().slice(-4)}${randomSuffix}`;

  // 6. Create order in PLACED / PENDING state
  const newOrder = await SubscriptionOrder.create({
    orderId,
    fleetCompanyId: fleetCompany._id,
    orderedByUserId: userId,
    buyerDetails: {
      companyName: fleetCompany.companyName,
      ownerName: req.user.fullName || req.user.name || "Fleet Owner",
      phone: req.user.phone,
      email: req.user.email || "support@fleet.com",
      gstNumber: fleetCompany.gstNumber || "N/A",
      billingAddress: {
        city: fleetCompany.city || "Jaipur",
        state: fleetCompany.state || "Rajasthan",
        pincode: fleetCompany.pincode || "",
      },
    },
    planId: plan._id,
    planSnapshot: {
      planName: plan.planName,
      maxCarSlots: plan.maxCarSlots,
      durationInDays: plan.durationInDays,
      originalPrice: plan.price,
    },
    amountPaid: totalPayable,
    gstAmount,
    orderStatus: "PLACED",
    paymentStatus: "PENDING",
    paymentGateway,
  });

  return res.status(201).json({
    success: true,
    message: "Subscription order initiated successfully.",
    data: {
      orderId: newOrder.orderId,
      totalPayable,
      planSnapshot: newOrder.planSnapshot,
      paymentStatus: newOrder.paymentStatus,
    },
  });
});

// ==========================================
// 2. VERIFY PAYMENT & ACTIVATE PLAN
// POST /api/v1/subscription-orders/verify
// ==========================================
const verifySubscriptionPayment = asyncHandler(async (req, res) => {
  const {
    orderId,
    gatewayPaymentId,
    gatewayOrderId,
    gatewaySignature,
    isMockPayment = false,
  } = req.body;

  if (!orderId) {
    throw createApiError(400, "Order ID is required.");
  }

  const order = await SubscriptionOrder.findOne({ orderId });
  if (!order) {
    throw createApiError(404, "Subscription order not found.");
  }

  if (order.paymentStatus === "SUCCESS") {
    throw createApiError(400, "This subscription order is already verified and active.");
  }

  const fleetCompany = await FleetCompany.findById(order.fleetCompanyId);
  if (!fleetCompany) {
    throw createApiError(404, "Fleet company profile not found.");
  }

  // Handle mock payment bypass in non-production environments
  let verifiedPaymentId = gatewayPaymentId;
  let verifiedOrderId = gatewayOrderId;

  const isDevOrTest = process.env.NODE_ENV !== "production";

  if (isMockPayment && isDevOrTest) {
    verifiedPaymentId = verifiedPaymentId || `MOCK_PAY_${Date.now()}`;
    verifiedOrderId = verifiedOrderId || `MOCK_ORD_${Date.now()}`;
  } else {
    if (!gatewayPaymentId || !gatewaySignature) {
      throw createApiError(400, "Payment verification credentials are missing.");
    }
    // Razorpay crypto verification can be added here
  }

  // Date rollover calculation: Extend expiry if an active subscription exists
  const now = new Date();
  const activeExistingOrder = await SubscriptionOrder.findOne({
    fleetCompanyId: fleetCompany._id,
    orderStatus: "COMPLETED",
    paymentStatus: "SUCCESS",
    expiresAt: { $gt: now },
  }).sort({ expiresAt: -1 });

  let startDate = now;
  let newExpiryDate;

  if (activeExistingOrder && activeExistingOrder.expiresAt > now) {
    startDate = new Date(activeExistingOrder.expiresAt);
    newExpiryDate = new Date(
      startDate.getTime() +
        order.planSnapshot.durationInDays * 24 * 60 * 60 * 1000
    );
  } else {
    newExpiryDate = new Date(
      now.getTime() +
        order.planSnapshot.durationInDays * 24 * 60 * 60 * 1000
    );
  }

  // Generate invoice number
  const invoiceNumber = `INV-SUB-${Date.now().toString().slice(-4)}${Math.floor(
    1000 + Math.random() * 9000
  )}`;

  order.orderStatus = "COMPLETED";
  order.paymentStatus = "SUCCESS";
  order.paymentGateway = isMockPayment ? "MANUAL" : order.paymentGateway;
  order.invoiceNumber = invoiceNumber;
  order.startsAt = startDate;
  order.expiresAt = newExpiryDate;
  order.gatewayPaymentId = verifiedPaymentId;
  order.gatewayOrderId = verifiedOrderId;
  order.gatewaySignature = gatewaySignature || null;
  await order.save();

  // Sync active subscription details on FleetCompany model
  fleetCompany.subscription = {
    isActive: true,
    currentPlanId: order.planId,
    maxCarSlots: order.planSnapshot.maxCarSlots,
    startsAt: startDate,
    expiresAt: newExpiryDate,
    lastOrderId: order._id,
  };
  await fleetCompany.save();

  return res.status(200).json({
    success: true,
    message: "Payment verified successfully and subscription activated.",
    data: {
      orderId: order.orderId,
      invoiceNumber: order.invoiceNumber,
      paymentStatus: order.paymentStatus,
      maxCarSlots: order.planSnapshot.maxCarSlots,
      startsAt: startDate,
      expiresAt: newExpiryDate,
      mode: isMockPayment ? "MOCK_BYPASS_MODE" : "LIVE_GATEWAY",
    },
  });
});

// ==========================================
// 3. GET ACTIVE SUBSCRIPTION STATUS
// GET /api/v1/subscription-orders/active
// ==========================================
const getActiveSubscription = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const fleetCompany = await FleetCompany.findOne({
    $or: [{ ownerUserId: userId }, { userId }, { ownerId: userId }],
  });

  if (!fleetCompany) {
    throw createApiError(404, "Fleet company profile not found.");
  }

  const activeSubscription = await SubscriptionOrder.findOne({
    fleetCompanyId: fleetCompany._id,
    orderStatus: "COMPLETED",
    paymentStatus: "SUCCESS",
    expiresAt: { $gte: new Date() },
  }).sort({ expiresAt: -1 });

  return res.status(200).json({
    success: true,
    message: activeSubscription
      ? "Active subscription details retrieved successfully."
      : "No active subscription found.",
    data: activeSubscription || null,
  });
});

module.exports = {
  createSubscriptionOrder,
  verifySubscriptionPayment,
  getActiveSubscription,
};