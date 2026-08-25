import "@testing-library/jest-dom/vitest";

// jsdom không implement `scrollIntoView` — bất kỳ component nào tự cuộn xuống tin nhắn mới nhất
// (`ChatPage.tsx`, `playground/TestAgentModal.tsx`) sẽ throw trong test nếu thiếu polyfill này.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
