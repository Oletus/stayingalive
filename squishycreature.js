'use strict';

var SquishyCreature = function(options) {
    var defaults = {
        gl: null,
        physics: null
    };
    objectUtil.initWithDefaults(this, defaults, options);
    this.organs = [];
    this.organRenderers = [];
    
    var renderer = new SoftBodyRenderer(this.gl, 'test.png');
    var grid = this.physics.generateMesh({});
    this.organRenderers.push(renderer);
    this.organs.push(grid);
    
};

SquishyCreature.prototype.render = function(worldTransform) {
    for (var i = 0; i < this.organs.length; ++i) {
        this.organRenderers[i].render(this.organs[i], worldTransform);
    }
};

SquishyCreature.prototype.update = function(deltaTime) {
};