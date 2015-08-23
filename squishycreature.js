'use strict';

var SquishyCreature = function(options) {
    var defaults = {
        gl: null,
        physics: null
    };
    this.time = 0.0;
    objectUtil.initWithDefaults(this, defaults, options);
    this.organs = [];
    this.organRenderers = [];
    
    var heartRenderer = new SoftBodyRenderer(this.gl, 'o_heart.png');
    var lungRenderer = new SoftBodyRenderer(this.gl, 'test.png');
    var intestineRenderer = new SoftBodyRenderer(this.gl, 'test.png');

    var grid;

    grid = this.physics.generateMesh({x: 0, y: 100, width: 2, height: 2});
    grid.renderer = heartRenderer;
    this.organs.push(grid);

    grid = this.physics.generateMesh({x: -20, y: -100, width: 4, height: 3});
    grid.renderer = lungRenderer;
    this.organs.push(grid);

    grid = this.physics.generateMesh({x: -500, y: -200, width: 25, height: 0, initScale: 30});
    grid.renderer = intestineRenderer;
    this.organs.push(grid);
};

SquishyCreature.prototype.render = function(worldTransform) {
    for (var i = 0; i < this.organs.length; ++i) {
        this.organs[i].renderer.render(this.organs[i], worldTransform);
    }
};

SquishyCreature.prototype.renderDebug = function(ctx, physics, worldTransform) {
    ctx.save();
    var transX = ctx.canvas.width * 0.5;
    var transY = ctx.canvas.height * 0.5;
    ctx.translate(transX, transY);
    var scaleX = worldTransform[0] * ctx.canvas.width * 0.5;
    var scaleY = worldTransform[5] * ctx.canvas.height * 0.5;
    ctx.scale(scaleX, -scaleY);
    for (var i = 0; i < this.organs.length; ++i) {
        physics.renderDebug(ctx, this.organs[i]);
    }
    ctx.restore();
};

SquishyCreature.prototype.update = function(deltaTime) {
    this.time += deltaTime;
    var pulseModifier = 1.0 + Math.sin(this.time * 3) * 0.1;
    for (var i = 0; i < this.organs.length; ++i) {
        this.organs[i].parameters.pulseModifier = pulseModifier;
    }
};
