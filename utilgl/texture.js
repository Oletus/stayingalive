'use strict';

/**
 * @return {function} Filter to create a GL texture from a Sprite.
 * Will set 'texture' property on the Sprite that can then be used to draw.
 */
Sprite.loadAsGLTexture = function(gl) {
    return function(sprite) {
        var tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sprite.img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D, null);
        sprite.texture = tex;
    };
};

var textureUtil = {};

/**
 * Create a texture and initialize it to use gl.NEAREST filtering and
 * gl.CLAMP_TO_EDGE clamping.
 * @param {WebGLRenderingContext} gl The WebGL context.
 * @param {number} width Width of the texture. Must be an integer.
 * @param {number} height Height of the texture. Must be an integer.
 * @param {GLenum=} format Texture format. Defaults to gl.RGBA.
 * @param {GLenum=} type Texture type. Defaults to gl.UNSIGNED_BYTE.
 * @return {WebGLTexture} The created texture.
 */
textureUtil.createTexture = function(gl, width, height, format, type) {
    if (format === undefined) {
        format = gl.RGBA;
    }
    if (type === undefined) {
        type = gl.UNSIGNED_BYTE;
    }
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, format, width, height, 0, format, type,
                  null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
};
