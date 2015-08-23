'use strict';

var Particle = function(point, springs, inertia, state) {
    this.point = point;
    if (!(springs instanceof Array)) {
        springs = [springs];
    }
    this.springs = springs;
    this.inertia = inertia ? inertia : 1;
    this.state_last = state ? state : new State();
    this.state = this.state_last.copy();
    this.externalForce = new CVec(0,0);
}

var State = function(position, momentum) {
    this.position = position ? position : new CVec(0,0);
    this.momentum = momentum ? momentum : new CVec(0,0);
};

State.prototype.set = function(other) {
    this.position.set(other.position);
    this.momentum.set(other.momentum);
    return this;
}

State.prototype.copy = function() {
    return new State(this.position.copy(), this.momentum.copy());
}

State.prototype.iadd = function(derivative) {
    this.position.iadd(derivative.dx);
    this.momentum.iadd(derivative.dp);
    return this;
}

/**
 * Holds the intermediate state for the integration
 */
var Derivative = function(dx, dp) {
    this.dx = dx ? dx : new CVec(0,0); //velocity
    this.dp = dp ? dp : new CVec(0,0); //force
}

Derivative.prototype.iadd = function(other) {
    this.dx.iadd(other.dx);
    this.dp.iadd(other.dp);
    return this;
}

Derivative.prototype.add = function(other) {
    return new Derivative(
        this.dx.add(other.dx),
        this.dp.add(other.dp)
    )
}

Derivative.prototype.mul = function(scalar) {
    return new Derivative(
        this.dx.mul(scalar),
        this.dp.mul(scalar)
    )
}

Derivative.prototype.imul = function(scalar) {
    this.dx.imul(scalar);
    this.dp.imul(scalar);
    return this;
}

var Spring = function(point, stiffness, damping, distance) {
    this.point = point ? point : new CVec(0,0);
    this.stiffness = stiffness ? stiffness : 10;
    this.damping = damping ? damping : 0.25;
    this.distance = distance ? distance : 0;
}

Spring.prototype.calculate = function(state) {
    var point = this.point;
    var stiffness=this.stiffness, damping=this.damping;
    var distance = this.distance;
    //x = pt-s.x
    var transform = point.sub(state.position);
    //k * x - s.p*d
    if (distance == 0) return point.sub(state.position).mul(stiffness).sub(state.momentum.mul(damping));
    //|x|
    var length = transform.length();
    // t = (|x|-d)(x/|x|)
    transform.idiv(length).imul(length-distance);
    //k * t - s.p*d
    return transform.mul(stiffness).sub(state.momentum.mul(damping));
}

var acceleration = function(particle, state) {
    //TODO
    var force = new CVec();
    for (var i = 0; i < particle.springs.length; ++i) {
        force.iadd(particle.springs[i].calculate(state));
    }
    force.iadd(new CVec((Math.random()-.5)*500, (Math.random()-.5)*500));
    force.iadd(particle.externalForce);
    return force;
}

var evaluate = function(particle, initial, dt, derivative) {
    var state = initial.copy().iadd(derivative.mul(dt));

    var derivative = new Derivative(
        state.momentum.div(particle.inertia),
        acceleration(particle, state)
    );
    return derivative;
}

var d0 = new Derivative();
var integrate = function(particle, state, dt) {
    var d1 = evaluate(particle, state, dt*0.0, d0);
    var d2 = evaluate(particle, state, dt*0.5, d1);
    var d3 = evaluate(particle, state, dt*0.5, d2);
    var d4 = evaluate(particle, state, dt*1.0, d3);

    d2.iadd(d3).imul(2);
    d4.iadd(d1).iadd(d2).imul(1/6);

    state.position.iadd(d4.dx.mul(dt));
    state.momentum.iadd(d4.dp.mul(dt));
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
    //XXX: An accumulator would probably be a good idea here

    // Update previous state
    for (var i = 0; i < this.particles.length; ++i) {
        var particle = this.particles[i];
        particle.state_last.set(particle.state);
    }
    // Perform integration on all elements
    for (var i = 0; i < this.particles.length; ++i) {
        var particle = this.particles[i];
        var state = particle.state;
        integrate( particle, state, deltaTime );

        // Update points
        particle.point.x = state.position.x;
        particle.point.y = state.position.y;
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
        subdivisions: 1,
        initScale: 100
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
            var x = -0.5 + sx/width;
            var y = 0.5 - sy/height;
            var point = {
                x: x,
                y: y,
                radius: Math.min(0.5, Math.max(0, Math.random() * (1.0 - Math.abs(x) - Math.abs(y))/3) + 0.3) * obj.initScale,
            };
            grid.positions.push(point);

            var springs = []; //[new Spring(new CVec(point.x*obj.initScale, point.y*obj.initScale), 1, 0.99)]; //new Spring(new CVec(point.x*PHYSICS_SCALE, point.y*PHYSICS_SCALE), 10-1*i, 0.8+0.05*i)
            var state = new State(new CVec(point.x*obj.initScale/2, point.y*obj.initScale/2));
            var particle = new Particle(point, springs, 1, state);
            gridparticles[sx][sy] = particle;
            this.particles.push(particle);
        }
    }

    for (var sx = 0; sx <= width; ++sx) {
        for (var sy = 0; sy <= height; ++sy) {
            var particle = gridparticles[sx][sy];
            // Horizontal / vertical springs
            if (sx > 0) particle.springs.push(createSpring(particle, gridparticles[sx-1][sy]));
            if (sx < width) particle.springs.push(createSpring(particle, gridparticles[sx+1][sy]));
            if (sy > 0) particle.springs.push(createSpring(particle, gridparticles[sx][sy-1]));
            if (sy < height) particle.springs.push(createSpring(particle, gridparticles[sx][sy+1]));
            // Diagonal springs
            if (sy < height && sx < width) particle.springs.push(createSpring(particle, gridparticles[sx+1][sy+1]));
            if (sy > 0 && sx > 0) particle.springs.push(createSpring(particle, gridparticles[sx-1][sy-1]));
            if (sy < height && sx > 0) particle.springs.push(createSpring(particle, gridparticles[sx-1][sy+1]));
            if (sy > 0 && sx < width) particle.springs.push(createSpring(particle, gridparticles[sx+1][sy-1]));
        }
    }

    return grid;
}

var createSpring = function(particle, target) {
    return new Spring(target.state_last.position, 100, 0.9, particle.state.position.distance(target.state.position));
}
