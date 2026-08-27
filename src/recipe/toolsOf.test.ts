/**
 * Một node `tool-call` mang NHIỀU tool.
 *
 * Trước đây `params.tool` là một chuỗi, nên agent muốn vừa tính toán vừa xem giờ phải thả HAI node.
 * `calculator`/`current_datetime` là hai hàm thuần, không chạm dữ liệu của ai — bắt vẽ một node cho
 * mỗi cái giống bắt khai báo mới được dùng máy tính bỏ túi.
 *
 * Recipe ĐÃ PUBLISH mang hình dạng lúc ghi mãi mãi, nên `toolsOf` phải đọc được cả hai: `tool` (một
 * chuỗi, dạng cũ) và `tools` (mảng, dạng mới).
 */

import { describe, expect, it } from "vitest";
import { toolsOf } from "./contract";

describe("toolsOf", () => {
  it("dạng mới: mảng nhiều tool", () => {
    expect(toolsOf({ tools: ["calculator", "current_datetime"] })).toEqual(["calculator", "current_datetime"]);
  });

  it("dạng CŨ: một chuỗi — recipe đã publish vẫn đọc được", () => {
    // Bỏ vế này thì mọi agent đã publish trước thay đổi mất sạch tool khi nạp lại canvas, và
    // publish tiếp sẽ ghi đè một whitelist rỗng — mất quyền âm thầm.
    expect(toolsOf({ tool: "calculator" })).toEqual(["calculator"]);
  });

  it("cả hai cùng có ⇒ mảng thắng", () => {
    // Ca chuyển tiếp: node vừa được sửa trong phiên này mang `tools`, còn `tool` cũ chưa bị dọn.
    // Đọc `tool` trước sẽ làm mọi lựa chọn mới của người dùng biến mất mà không báo gì.
    expect(toolsOf({ tool: "calculator", tools: ["current_datetime"] })).toEqual(["current_datetime"]);
  });

  it("chưa cấu hình ⇒ rỗng, không phải ['']", () => {
    // Chuỗi rỗng đẩy vào whitelist là dữ liệu hỏng nằm im tới tận tầng engine.
    expect(toolsOf({})).toEqual([]);
    expect(toolsOf({ tool: "" })).toEqual([]);
    expect(toolsOf({ tools: ["", "  "] })).toEqual([]);
  });

  it("bỏ trùng, giữ thứ tự", () => {
    // `recipe_hash` băm nguyên recipe: thứ tự đổi giữa hai lần render là hash đổi, và cổng publish
    // coi cùng một agent là hai bản khác nhau.
    expect(toolsOf({ tools: ["calculator", "calculator", "current_datetime"] })).toEqual([
      "calculator",
      "current_datetime",
    ]);
  });

  it("hình dạng lạ ⇒ rỗng, không crash", () => {
    expect(toolsOf({ tools: "calculator" })).toEqual([]);
    expect(toolsOf({ tools: [7, null] })).toEqual([]);
    expect(toolsOf({ tool: 7 })).toEqual([]);
  });
});
