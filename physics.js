'use strict';

var Particle = function(point, springs, inertia, state) {
    this.point = point;
    if (!(springs instanceof Array)) {
        springs = [springs];
    }
    this.springs = springs;
    this.inertia = inertia ? inertia : 1;
    this.state_last = state ? state : new State();
    this.state_temp = state ? state : new State();
    this.state = this.state_last.copy();
    this.externalForce = new CVec(0,0);
}

var State = function(position) {
    this.position = position ? position : new CVec(0,0);
};

State.prototype.set = function(other) {
    this.position.set(other.position);
    return this;
}

State.prototype.copy = function() {
    return new State(this.position.copy());
}

State.prototype.iadd = function(derivative) {
    this.position.iadd(derivative.dx);
    return this;
}


var Spring = function(point, stiffness, distance, particle1, particle2) {
    this.point = point ? point : new CVec(0,0);
    this.stiffness = stiffness ? stiffness : 10;
    this.distance = distance ? distance : 0;
    this.particle1 = particle1;
    this.particle2 = particle2;
}

Spring.prototype.calculate = function(state) {
    var point = this.point;
    var stiffness=this.stiffness, damping=this.damping;
    var distance = this.distance;
    //x = pt-s.x
    var transform = point.sub(state.position);
    //k * x - s.p*d
    if (distance == 0) return point.sub(state.position).mul(stiffness);
    //|x|
    var length = transform.length();
    // t = (|x|-d)(x/|x|)
    transform.idiv(length).imul(length-distance);
    //k * t - s.p*d
    return transform.mul(stiffness);
}

Spring.prototype.minDistance = function() {
    return Math.max(this.particle1.point.radius + this.particle2.point.radius, this.distance);
};

Spring.prototype.maxDistance = function() {
    return this.distance * 1.5;
};

var acceleration = function(particle, state) {
    //TODO
    var force = new CVec();
    for (var i = 0; i < particle.springs.length; ++i) {
        force.iadd(particle.springs[i].calculate(state));
    }
    //force.iadd(new CVec((Math.random()-.5)*3500, (Math.random()-.5)*3500));
    force.iadd(particle.externalForce);
    return force;
}

/**
 * An updater to handle the physics loop and state changes
 */
var GamePhysics = function(resizer) {
    this.canvas = resizer.getCanvas();
    this.gl = this.canvas.getContext('webgl');
    Sprite.gl = this.gl;

    this.particles = [];
};

GamePhysics.prototype.render = function(ctx) {
    // CanvasResizer passes a wrapped 2D context to use here when run in FIXED_COORDINATE_SYSTEM mode,
    // where ctx.canvas.width/height are set to the coordinate system width/height.
    // Otherwise the context initialized here is used.
    if (ctx === undefined) {
        ctx = this.gl;
    }
    var gl = ctx;

    return ctx;
};

GamePhysics.prototype.update = function(deltaTime) {
    // Perform integration on all elements
    for (var i = 0; i < this.particles.length; ++i) {
        var particle = this.particles[i];
        var state = particle.state;

        // Verlet integration
        var acc = acceleration(particle, state);
        particle.state_temp.set(state);
        state.position.x = 2 * state.position.x - particle.state_last.position.x + acc.x * deltaTime * deltaTime;
        state.position.y = 2 * state.position.y - particle.state_last.position.y + acc.y * deltaTime * deltaTime;
    }

    // Hard constraints
    for (var j = 0; j < 5; ++j) { // Relaxation
        for (var i = 0; i < this.particles.length; ++i) {
            var particle = this.particles[i];
            // Hard constraints for springs
            for (var k = 0; k < particle.springs.length; ++k) {
                var minDistance = particle.springs[k].minDistance();
                var maxDistance = particle.springs[k].maxDistance();
                var particle2 = particle.springs[k].particle2;
                var distance = particle.state.position.distance(particle2.state.position);
                if (distance < minDistance) {
                    var diff = particle.state.position.sub(particle2.state.position);
                    diff.normalize();
                    diff.imul(0.5 * (minDistance - distance));
                    particle.state.position.iadd(diff);
                    particle2.state.position.isub(diff);
                }
                else if (distance > maxDistance) {
                    var diff = particle.state.position.sub(particle2.state.position);
                    diff.normalize();
                    diff.imul(-0.5 * (distance - maxDistance));
                    particle.state.position.iadd(diff);
                    particle2.state.position.isub(diff);
                }
            }
            // Hard constraints for all other particles in the scene
            // TODO: Implement and optimize this with a grid-based acceleration structure
        }
    }

    for (var i = 0; i < this.particles.length; ++i) {
        var particle = this.particles[i];
        // Update points
        particle.point.x = particle.state.position.x;
        particle.point.y = particle.state.position.y;

        particle.state_last.set(particle.state_temp);
    }
};

GamePhysics.prototype.getNearestParticle = function(worldPos, smallestDistance) {
    var nearestParticle = null;
    for (var i = 0; i < this.particles.length; ++i) {
        var distance = this.particles[i].state.position.distance(worldPos);
        if (distance < smallestDistance) {
            nearestParticle = this.particles[i];
            smallestDistance = distance;
        }
    }
    return nearestParticle;
};

GamePhysics.prototype.generateMesh = function(options) {
    var defaults = {
        width: 2,
        height: 2,
        initScale: 50
    };
    var obj = {};
    objectUtil.initWithDefaults(obj, defaults, options);

    var grid = {
        width: obj.width,
        height: obj.height,
        positions: [
            // {
            //     x: -0.5,
            //     y: 0.5,
            //     radius: 0.3
            // },
            // {
            //     x: -0.5,
            //     y: -0.5,
            //     radius: 0.3
            // },
            // {
            //     x: 0.5,
            //     y: 0.5,
            //     radius: 0.3
            // },
            // {
            //     x: 0.5,
            //     y: -0.5,
            //     radius: 0.3
            // }
        ]
    };

    var gridparticles = [];

    var width = obj.width;
    var height = obj.height;
    for (var sx = 0; sx <= width; ++sx) {
        gridparticles[sx] = [];
        for (var sy = 0; sy <= height; ++sy) {
            var point = {
                x: sx * obj.initScale,
                y: sy * obj.initScale,
                radius: 0.5 * obj.initScale,
            };
            grid.positions.push(point);

            var springs = [];
            var state = new State(new CVec(point.x, point.y));
            var particle = new Particle(point, springs, 1, state);
            gridparticles[sx][sy] = particle;
            this.particles.push(particle);
        }
    }

    for (var sx = 0; sx <= width; ++sx) {
        for (var sy = 0; sy <= height; ++sy) {
            var particle = gridparticles[sx][sy];
            // Horizontal / vertical springs
            if (sx > 0) particle.springs.push(createSpring(particle, gridparticles[sx-1][sy], false));
            if (sx < width) particle.springs.push(createSpring(particle, gridparticles[sx+1][sy], false));
            if (sy > 0) particle.springs.push(createSpring(particle, gridparticles[sx][sy-1], false));
            if (sy < height) particle.springs.push(createSpring(particle, gridparticles[sx][sy+1], false));
            // Diagonal springs
            if (sy < height && sx < width) particle.springs.push(createSpring(particle, gridparticles[sx+1][sy+1], true));
            if (sy > 0 && sx > 0) particle.springs.push(createSpring(particle, gridparticles[sx-1][sy-1], true));
            if (sy < height && sx > 0) particle.springs.push(createSpring(particle, gridparticles[sx-1][sy+1], true));
            if (sy > 0 && sx < width) particle.springs.push(createSpring(particle, gridparticles[sx+1][sy-1], true));
        }
    }

    return grid;
}

var createSpring = function(particle, target, diagonal) {
    var stiffness = 200;
    return new Spring(target.state_last.position, stiffness, particle.state.position.distance(target.state.position), particle, target);
}
