/**
 * The server's clock, read outside render.
 *
 * Pages that show "checked 2 days ago" need the current time, and reading a
 * clock inside a component makes its output depend on when React happens to
 * run it. Every page that needs the time takes it from here once, at the top,
 * and passes it down as an ordinary value — so the view is a function of its
 * props, and a test can pass any moment it likes.
 */
export function nowForRender(): Date {
  return new Date();
}
