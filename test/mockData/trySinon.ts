const sinon = require("sinon");

function once(fn) {
  let returnValue;
  let called = false;
  return function () {
    if (!called) {
      called = true;
      returnValue = fn.apply(this);
    }
    return returnValue;
  };
}

describe("ucenje", function () {
  it("should call original function", function () {
    let callback = sinon.fake();
    let wrap = once(callback);

    console.log(wrap());

    console.log(callback.calledOnce);
  });
});
