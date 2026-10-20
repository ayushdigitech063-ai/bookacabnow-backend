const SubscriptionPlan = require("../models/SubscriptionPlan.model.js");
const { asyncHandler } = require("../utils/asyncHandler.js");
const { createApiError } = require("../utils/apiError.js");
const { sendApiResponse } = require("../utils/apiResponse.js");

// ==========================================
// 1. ADMIN: Create New Subscription Plan
// ==========================================
const createSubscriptionPlan = asyncHandler(async (req, res) => {
  const {
    planName,
    tagline,
    durationInDays = 30,
    maxCarSlots,
    price,
    discountPercentage = 0,
    features = [],
    isPopular = false,
  } = req.body;

  // Validation
  if (!planName || !maxCarSlots || price === undefined) {
    throw createApiError(
      400,
      "planName, maxCarSlots, and price are required fields."
    );
  }

  // Check duplicate plan name
  const existingPlan = await SubscriptionPlan.findOne({
    planName: planName.trim(),
  });
  if (existingPlan) {
    throw createApiError(400, `Plan with name "${planName}" already exists.`);
  }

  // Create plan
  const newPlan = await SubscriptionPlan.create({
    planName: planName.trim(),
    tagline: tagline ? tagline.trim() : undefined,
    durationInDays: Number(durationInDays),
    maxCarSlots: Number(maxCarSlots),
    price: Number(price),
    discountPercentage: Number(discountPercentage),
    features: Array.isArray(features) ? features : [],
    isPopular: Boolean(isPopular),
    isActive: true,
  });

  return sendApiResponse(
    res,
    201,
    newPlan,
    "Subscription plan created successfully."
  );
});

// ==========================================
// 2. FLEET OWNER / PUBLIC: Get All Active Plans
// ==========================================
const getActiveSubscriptionPlans = asyncHandler(async (req, res) => {
  // Sirf active plans fetch honge, sorted by price (ascending)
  const plans = await SubscriptionPlan.find({ isActive: true }).sort({
    price: 1,
  });

  return sendApiResponse(
    res,
    200,
    plans,
    "Active subscription plans fetched successfully."
  );
});

// ==========================================
// 3. ADMIN: Get All Plans (Including Inactive)
// ==========================================
const getAllPlansAdmin = asyncHandler(async (req, res) => {
  const plans = await SubscriptionPlan.find().sort({ createdAt: -1 });

  return sendApiResponse(
    res,
    200,
    plans,
    "All subscription plans fetched for admin."
  );
});

// ==========================================
// 4. ADMIN: Update Plan Details
// ==========================================
const updateSubscriptionPlan = asyncHandler(async (req, res) => {
  const { planId } = req.params;
  const {
    planName,
    tagline,
    durationInDays,
    maxCarSlots,
    price,
    discountPercentage,
    features,
    isPopular,
    isActive,
  } = req.body;

  // 1. Check karo plan database me exist karta hai ya nahi
  const existingPlan = await SubscriptionPlan.findById(planId);
  if (!existingPlan) {
    throw createApiError(404, "Subscription plan nahi mila");
  }

  // 2. Agar planName update ho raha hai, toh check karo kisi aur plan ka same name na ho
  if (planName && planName.trim() !== existingPlan.planName) {
    const duplicate = await SubscriptionPlan.findOne({
      _id: { $ne: planId },
      planName: planName.trim(),
    });
    if (duplicate) {
      throw createApiError(
        400,
        `"${planName.trim()}" naam se ek dusra plan pehle se maujood hai`
      );
    }
  }

  // 3. Validation checks (Numeric safety)
  if (maxCarSlots !== undefined && Number(maxCarSlots) < 1) {
    throw createApiError(400, "maxCarSlots kam se kam 1 hona chahiye");
  }

  if (price !== undefined && Number(price) < 0) {
    throw createApiError(400, "Price negative nahi ho sakti");
  }

  if (durationInDays !== undefined && Number(durationInDays) < 1) {
    throw createApiError(400, "durationInDays kam se kam 1 din hona chahiye");
  }

  if (
    discountPercentage !== undefined &&
    (Number(discountPercentage) < 0 || Number(discountPercentage) > 100)
  ) {
    throw createApiError(400, "discountPercentage 0 se 100 ke beech hona chahiye");
  }

  // 4. Update fields object build karo (Sirf wahi update hoga jo body me aayega)
  const updateFields = {};
  if (planName) updateFields.planName = planName.trim();
  if (tagline !== undefined) updateFields.tagline = tagline.trim();
  if (durationInDays !== undefined) updateFields.durationInDays = Number(durationInDays);
  if (maxCarSlots !== undefined) updateFields.maxCarSlots = Number(maxCarSlots);
  if (price !== undefined) updateFields.price = Number(price);
  if (discountPercentage !== undefined) updateFields.discountPercentage = Number(discountPercentage);
  if (features && Array.isArray(features)) updateFields.features = features;
  if (isPopular !== undefined) updateFields.isPopular = Boolean(isPopular);
  if (isActive !== undefined) updateFields.isActive = Boolean(isActive);

  // 5. Update document
  const updatedPlan = await SubscriptionPlan.findByIdAndUpdate(
    planId,
    { $set: updateFields },
    { new: true, runValidators: true }
  );

  return sendApiResponse(
    res,
    200,
    updatedPlan,
    "Subscription plan safaltapoorvak update ho gaya"
  );
});
// ==========================================
// 5. ADMIN: Toggle Active/Inactive Status (Soft Delete)
// ==========================================
const togglePlanStatus = asyncHandler(async (req, res) => {
  const { planId } = req.params;

  const plan = await SubscriptionPlan.findById(planId);
  if (!plan) {
    throw createApiError(404, "Subscription plan not found.");
  }

  plan.isActive = !plan.isActive;
  await plan.save();

  return sendApiResponse(
    res,
    200,
    plan,
    `Plan marked as ${plan.isActive ? "Active" : "Inactive"} successfully.`
  );
});

module.exports = {
  createSubscriptionPlan,
  getActiveSubscriptionPlans,
  getAllPlansAdmin,
  updateSubscriptionPlan,
  togglePlanStatus,
};