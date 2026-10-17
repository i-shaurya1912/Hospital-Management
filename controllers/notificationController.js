const Notification = require("../models/Notification");
const logger = require("../config/logger");

// GET /api/notifications - sirf logged-in user ki apni
exports.getMyNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(30);
    res.json(notifications);
  } catch (err) {
    logger.error(`Get notifications error: ${err.message}`);
    res.status(500).json({ message: "Failed to fetch notifications" });
  }
};

// PUT /api/notifications/:id/read
exports.markAsRead = async (req, res) => {
  try {
    // _id aur user dono match hone chahiye, warna kisi aur ki notification touch nahi hogi
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { read: true },
      { new: true }
    );
    if (!notification) return res.status(404).json({ message: "Notification not found" });
    res.json(notification);
  } catch (err) {
    logger.error(`Mark read error: ${err.message}`);
    res.status(400).json({ message: "Invalid notification id" });
  }
};

// PUT /api/notifications/read-all
exports.markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany({ user: req.user._id, read: false }, { read: true });
    res.json({ message: "All notifications marked as read" });
  } catch (err) {
    logger.error(`Mark all read error: ${err.message}`);
    res.status(500).json({ message: "Failed to update notifications" });
  }
};

// Internal helper - doosre controllers use karenge, ye HTTP route nahi hai
exports.createNotification = async ({ userId, message, type, relatedId }) => {
  try {
    await Notification.create({ user: userId, message, type, relatedId });
  } catch (err) {
    // Notification fail hone se main kaam (appointment booking) nahi rukna chahiye
    logger.error(`Failed to create notification: ${err.message}`);
  }
};