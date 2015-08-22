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

SoftBodyRenderer.vertexSrc = [
'attribute vec2 aVertexPosition;',
'attribute vec2 a_texCoord;',
'varying vec2 v_texCoord;',
'void main() {',
'    gl_Position = vec4(aVertexPosition, 0.0, 1.0);',
'    v_texCoord = a_texCoord;',
'}'
].join('\n');

SoftBodyRenderer.fragmentSrc = [
'precision highp float;',
'uniform sampler2D u_tex;',
'varying vec2 v_texCoord;',
'void main() {',
'    gl_FragColor = texture2D(u_tex, v_texCoord);',
'}'
].join('\n');

SoftBodyRenderer.loadShaders = function(gl) {
    var uniforms = {'u_tex': 'tex2d'};
    SoftBodyRenderer.shader = new ShaderProgram(gl, SoftBodyRenderer.fragmentSrc, SoftBodyRenderer.vertexSrc, uniforms);
};