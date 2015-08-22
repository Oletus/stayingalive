'use strict';

var SoftBodyRenderer = function(gl, src) {
    this.testSprite = new Sprite('test.png', Sprite.loadAsGLTexture(gl));
};

/**
 * @param {Object} grid Positions calculated by physics in the following format:
 * {
 *   width: {number}
 *   height: {number}
 *   positions: [
 *     {
 *        x: {number}
 *        y: {number}
 *        radius: {number}
 *     }
 *   ]
 * }
 * With positions of points forming a rectangular grid in a column-major order.
 */
SoftBodyRenderer.prototype.render = function(grid) {
    
};
