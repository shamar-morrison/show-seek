// Lightweight mock for googleapis – avoids loading the massive real package in Jest.
const mockAndroidPublisher = jest.fn(() => ({
  purchases: {
    subscriptions: { get: jest.fn(), acknowledge: jest.fn() },
    products: { get: jest.fn(), acknowledge: jest.fn() },
  },
}));

const mockGoogleAuth = jest.fn().mockImplementation(() => ({}));

module.exports = {
  google: {
    auth: { GoogleAuth: mockGoogleAuth },
    androidpublisher: mockAndroidPublisher,
  },
  androidpublisher_v3: {},
};
