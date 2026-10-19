const SubscriptionPlan = require("../models/SubscriptionPlan.model.js");
const SubscriptionOrder = require("../models/SubscriptionOrder.model.js");
const FleetCompany = require("../models/FleetCompany.model.js");
const Vehicle = require("../models/Vehicle.model.js");
const { asyncHandler } = require("../utils/asyncHandler.js");
const { createApiError } = require("../utils/apiError.js");
const { sendApiResponse } = require("../utils/apiResponse.js");

// 1. Order initiate karna (Fleet Owner Only)
const createSubscriptionOrder = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { planId, paymentGateway = "MANUAL" } = req.body;

  // Fleet Owner verification
  const fleetCompany = req.fleetCompany;
  if (!fleetCompany) {
    throw createApiError(403, "Keval registered fleet owners hi subscription le sakte hain");
  }

  // Plan verification
  const plan = await SubscriptionPlan.findById(planId);
  if (!plan || !plan.isActive) {
    throw createApiError(404, "Subscription plan uplabdh nahi hai ya inactive hai");
  }

  // Downgrade Guard: Active gaadiyan plan slots se jyada toh nahi hain?
  const activeCarsCount = await Vehicle.countDocuments({
    fleetCompanyId: fleetCompany._id,
    isActive: true,
  });

  if (activeCarsCount > plan.maxCarSlots) {
    throw createApiError(
      400,
      `Aapke paas ${activeCarsCount} active gaadiyan hain. Is plan ki limit ${plan.maxCarSlots} hai. Pehle extra gaadiyan deactivate karein.`
    );
  }

  // Amount & GST Calculation (18% GST)
  const basePrice = plan.price;
  const discountAmount = (basePrice * (plan.discountPercentage || 0)) / 100;
  const finalPrice = Math.round(basePrice - discountAmount);
  const gstAmount = Math.round(finalPrice * 0.18);
  const totalPayable = finalPrice + gstAmount;

  // Order ID generation
  const randomSuffix = Math.floor(10000 + Math.random() * 90000);
  const orderId = `ORD-SUB-${Date.now().toString().slice(-4)}${randomSuffix}`;

  // Order create (Status: PENDING)
  const newOrder = await SubscriptionOrder.create({
    orderId,
    fleetCompanyId: fleetCompany._id,
    orderedByUserId: userId,
    buyerDetails: {
      companyName: fleetCompany.companyName,
      ownerName: req.user.name || "Fleet Owner",
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

  return sendApiResponse(
    res,
    201,
    {
      orderId: newOrder.orderId,
      totalPayable,
      planSnapshot: newOrder.planSnapshot,
      paymentStatus: newOrder.paymentStatus,
    },
    "Subscription order initiate ho gaya"
  );
});

// 2. Payment Verification & Activation (With Mock Bypass Support)
const verifySubscriptionPayment = asyncHandler(async (req, res) => {
  const {
    orderId,
    gatewayPaymentId,
    gatewayOrderId,
    gatewaySignature,
    isMockPayment = false,
  } = req.body;

  if (!orderId) {
    throw createApiError(400, "orderId zaroori hai");
  }

  // Order check
  const order = await SubscriptionOrder.findOne({ orderId });
  if (!order) {
    throw createApiError(404, "Subscription order nahi mila");
  }

  if (order.paymentStatus === "SUCCESS") {
    throw createApiError(400, "Yeh order pehle se verified aur active hai");
  }

  const fleetCompany = await FleetCompany.findById(order.fleetCompanyId);
  if (!fleetCompany) {
    throw createApiError(404, "Fleet company profile nahi mili");
  }

  // Gateway Verification vs Mock Bypass Logic
  let verifiedPaymentId = gatewayPaymentId;
  let verifiedOrderId = gatewayOrderId;

  const isDevOrTest = process.env.NODE_ENV !== "production";

  if (isMockPayment && isDevOrTest) {
    // Dummy transaction IDs generate karo
    verifiedPaymentId = verifiedPaymentId || `MOCK_PAY_${Date.now()}`;
    verifiedOrderId = verifiedOrderId || `MOCK_ORD_${Date.now()}`;
  } else {
    // Production / Real Gateway check
    if (!gatewayPaymentId || !gatewaySignature) {
      throw createApiError(400, "Payment verification credentials missing");
    }
    // Baad mein Razorpay crypto verification yahan add hogi
  }

  // Date Rollover Calculation
  const now = new Date();
  const currentExpiry = fleetCompany.subscription?.expiresAt;

  let startDate = now;
  let newExpiryDate;

  // Agar purana plan bacha hua hai toh usi ke aage date extend hogi
  if (currentExpiry && new Date(currentExpiry) > now) {
    startDate = new Date(currentExpiry);
    newExpiryDate = new Date(
      new Date(currentExpiry).getTime() +
        order.planSnapshot.durationInDays * 24 * 60 * 60 * 1000
    );
  } else {
    newExpiryDate = new Date(
      now.getTime() + order.planSnapshot.durationInDays * 24 * 60 * 60 * 1000
    );
  }

  // Order status update
  const invoiceNumber = `INV-SUB-${Date.now().toString().slice(-4)}${Math.floor(1000 + Math.random() * 9000)}`;

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

  // Fleet Company quota aur validity sync
  fleetCompany.subscription = {
    isActive: true,
    currentPlanId: order.planId,
    maxCarSlots: order.planSnapshot.maxCarSlots,
    startsAt: startDate,
    expiresAt: newExpiryDate,
    lastOrderId: order._id,
  };
  await fleetCompany.save();

  return sendApiResponse(
    res,
    200,
    {
      orderId: order.orderId,
      invoiceNumber: order.invoiceNumber,
      paymentStatus: order.paymentStatus,
      maxCarSlots: fleetCompany.subscription.maxCarSlots,
      startsAt: startDate,
      expiresAt: newExpiryDate,
      mode: isMockPayment ? "MOCK_BYPASS_MODE" : "LIVE_GATEWAY",
    },
    "Payment successfully verify ho gaya aur subscription activate kar di gayi"
  );
});

module.exports = {
  createSubscriptionOrder,
  verifySubscriptionPayment,
};