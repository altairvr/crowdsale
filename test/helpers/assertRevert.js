module.exports = async function (promise) {
  try {
    await promise;
    assert.fail('Expected revert not received');
  } catch (error) {
    const revertFound = error.message.search('revert') >= 0;
    assert.isTrue(revertFound, `Expected "revert", got ${error} instead`);
  }
};
