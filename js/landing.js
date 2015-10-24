//Alexander Shieh, 2015
//Adapted from John Watson, 2014
//Licensed under the terms of the MIT License

//Define NN
var NeuralNetwork = function(){};
var layer_defs = [];

layer_defs.push({type: 'input', out_sx:1, out_sy:1, out_depth: 10});
layer_defs.push({type: 'fc', num_neurons: 6, activation: 'sigmoid'});
layer_defs.push({type: 'fc', num_neurons: 4, activation: 'sigmoid'});
layer_defs.push({type: 'fc', num_neurons: 6, activation: 'sigmoid'});
layer_defs.push({type: 'regression', num_neurons: 6});

var net = new convnetjs.Net();
net.makeLayers(layer_defs);
var trainer = new convnetjs.Trainer(net, {method: 'adadelta', l2_decay: 0.001, batch_size: 10});

var trainCnt = 0;
var trainFlag = 0;
var trainSeq = [];
var endFlag = 0;
var lastState = new convnetjs.Vol(1, 1, 24, 0.0);
var lastAction = 0;
var lastReward = 0;
var thisAction = 0;
var episode = 0;
var gamma = 0.9;
var testFlag = false;
var eps = 0.7;
var FPS = 3;
var result = [];
//end NN

var GameState = function(game) {
};

GameState.prototype.preload = function() {
    this.game.load.spritesheet('ship', 'assets/ship.png', 32, 32);
    this.game.load.image('terrain', 'assets/terrainblock.png');
    this.game.load.image('landzone', 'assets/landzone.png');
    this.game.load.spritesheet('explosion', 'assets/explosion.png', 128, 128);
    this.stage.disableVisibilityChange = true;
};

GameState.prototype.create = function() {
    this.stage.disableVisibilityChange = true;
    this.game.stage.backgroundColor = 0x333333;
    this.PLAYED = 0;
    this.SCORE = 0;
    this.FUEL = 150;
    this.TIMER = 0;
    this.ROTATION_SPEED = 10; // degrees/second
    this.ACCELERATION = 100; // pixels/second/second
    this.MAX_SPEED = 250; // pixels/second
    this.DRAG = 0; // pixels/second
    this.GRAVITY = 50; // pixels/second/second


    //Landzone
     this.landzone = this.game.add.group();    

    for(var x = 0; x < this.game.width; x += 8){
        var landzoneBlock = this.game.add.sprite(x, this.game.height-8, 'landzone');
        this.game.physics.enable(landzoneBlock, Phaser.Physics.ARCADE);
        landzoneBlock.body.immovable = true;
        landzoneBlock.body.allowGravity = false;
        this.landzone.add(landzoneBlock);
    }
    //Ship
    this.ship = this.game.add.sprite(0, 0, 'ship');
    this.ship.anchor.setTo(0.5, 0.5);
    this.ship.angle = -90; // Point the ship up
    this.game.physics.enable(this.ship, Phaser.Physics.ARCADE);
    this.ship.body.maxVelocity.setTo(this.MAX_SPEED, this.MAX_SPEED); // x, y
    this.ship.body.drag.setTo(this.DRAG, this.DRAG); // x, y
    game.physics.arcade.gravity.y = this.GRAVITY;
    this.ship.body.bounce.setTo(0.25, 0.25);
    this.resetScene();

    this.explosionGroup = this.game.add.group();

    this.game.input.keyboard.addKeyCapture([
        Phaser.Keyboard.LEFT,
        Phaser.Keyboard.RIGHT,
        Phaser.Keyboard.UP,
        Phaser.Keyboard.DOWN
    ]);
    
};


GameState.prototype.getExplosion = function() {

    var explosion = this.explosionGroup.getFirstDead();

    if (explosion === null) {
        explosion = this.game.add.sprite(0, 0, 'explosion');
        explosion.anchor.setTo(0.5, 0.5);

        var animation = explosion.animations.add('boom', [0,1,2,3], 60, false);
        animation.killOnComplete = true;

        this.explosionGroup.add(explosion);
    }

    explosion.revive();

    explosion.x = this.ship.x;
    explosion.y = this.ship.y;

    explosion.angle = this.game.rnd.integerInRange(0, 360);

    explosion.animations.play('boom');

    return explosion;
};

GameState.prototype.getReward = function(){
    var dist, 
    dist = this.game.height - this.ship.y - 8;
    
    return 0.5*Math.log(1/Math.abs(dist)) + -3*(Math.sin(this.ship.rotation)-0.5) + Math.log(1/Math.abs(this.ship.body.velocity.y));
};

GameState.prototype.getState = function(){
    var state = new convnetjs.Vol(1, 1, 10, 0.0);
    state.w[0] = this.ship.body.velocity.x;
    state.w[1] = this.ship.body.velocity.y;
    state.w[2] = this.ship.body.acceleration.x;
    state.w[3] = this.ship.body.acceleration.y;
    state.w[4] = this.ship.body.angularVelocity;
    state.w[5] = Math.sin(this.ship.rotation);
    state.w[6] = this.ship.x;
    state.w[7] = this.ship.y;
    state.w[8] = this.game.width - this.ship.x;
    state.w[9] = this.game.height - this.ship.y;
    return state;
};

GameState.prototype.updateScore = function(flag) {
    this.PLAYED++;
    if(flag == 2) this.SCORE++;
    document.getElementById("score").innerHTML = this.SCORE+'/'+this.PLAYED;
    document.getElementById("episode").innerHTML = ++episode;
};

GameState.prototype.showVelocity = function() {
    document.getElementById("vx").innerHTML = this.ship.body.velocity.x.toFixed(2);
    document.getElementById("vy").innerHTML = this.ship.body.velocity.y.toFixed(2);
    document.getElementById("fuel").innerHTML = this.FUEL;
    document.getElementById("reward").innerHTML = lastReward.toFixed(2);
    document.getElementById("action").innerHTML = thisAction;
    document.getElementById("timer").innerHTML = this.TIMER;
    
};

GameState.prototype.resetScene = function() {
    // Move the ship back to the top of the stage
    this.ship.x = 150 + Math.random()*200;
    this.ship.y = 150 + Math.random()*200;
    this.ship.body.acceleration.setTo(0, 0);

    // Select a random starting angle and velocity

    this.ship.angle = this.game.rnd.integerInRange(-80, -100);
    this.ship.body.velocity.setTo(Math.random()*10 - 5, Math.random()*20 - 10);
    this.FUEL = 600;
    this.TIMER = 0;
    lastState = this.getState();
};

GameState.prototype.checkLanding = function() {
    if(this.ship.body.touching.down) {
        if( Math.abs(this.ship.body.velocity.y) < 30
            && Math.abs(this.ship.body.velocity.x) < 30
            && Math.abs(Math.cos(this.ship.rotation)) < 0.2
        ){
            this.ship.body.angularVelocity = 0;
            this.ship.body.velocity.setTo(0, 0);
            this.ship.angle = -90;
            endFlag = 2;
            this.updateScore(endFlag);
            this.resetScene();
        }else{
            this.getExplosion(this.ship.x, this.ship.y);
            endFlag = 1;
            this.updateScore(endFlag);
            this.resetScene();
        }
    }
}

// The update() method is called every frame
GameState.prototype.update = function() {
    
    this.TIMER++;
    if(this.TIMER % FPS == 0){
        thisReward = this.getReward();
    }
    this.showVelocity(this.ship.body.velocity.x, this.ship.body.velocity.y);
    // Collide the ship with the ground
    this.game.physics.arcade.collide(this.ship, this.landzone, function(){
        this.checkLanding();
    }, null, this);

    //Game Over
    if(this.ship.x > this.game.width || this.ship.x < 0 || this.ship.y > this.game.height || this.ship.y < 0 || this.FUEL <= 0){
        endFlag = 1;
        this.updateScore(endFlag);
    }


    //Rotation
    if(thisAction == 2 || thisAction == 4) {
        this.ship.body.angularVelocity = -this.ROTATION_SPEED;
    }else if(thisAction == 3 || thisAction == 5) {
        this.ship.body.angularVelocity = this.ROTATION_SPEED;
    }else{
        this.ship.body.angularVelocity = 0;
    }

    if(thisAction == 1 || thisAction == 4 || thisAction == 5) {
        this.ship.body.acceleration.x = Math.cos(this.ship.rotation) * this.ACCELERATION;
        this.ship.body.acceleration.y = Math.sin(this.ship.rotation) * this.ACCELERATION;
        this.FUEL -= 1;
        this.ship.frame = 1;
    }else{
        this.ship.body.acceleration.setTo(0, 0);
        this.ship.frame = 0;
    }
    
    thisState = this.getState();
    thisAction = -1;
    max = -1e9;

    if(this.TIMER % FPS == 0){
        thisState = this.getState();
        thisAction = -1;
        var max = -1e9;
        approx = net.forward(thisState);
        //console.log(approx.w);
        if(!testFlag && Math.random() > eps){
            thisAction = Math.floor(Math.random()*6);
            max = approx.w[thisAction];
        }else{
            //argmax
            for(var a = 0; a < 6; ++a){
                if(approx.w[a] > max){
                    thisAction = a;
                    max = approx.w[a];
                }
            }
        }

        if(!testFlag) trainSeq.push([lastState, lastAction, thisReward-lastReward, thisState]);
        lastState = thisState;
        lastAction = thisAction;
        lastReward = thisReward;
    }

    
    
    if(endFlag && !testFlag){

        while(trainSeq.length){
            var data = trainSeq.pop();
            var X = data[0];
            var Y = net.forward(data[0]);
            var Z = net.forward(data[3]);
            var max = -1e9
            for(var a = 0; a < 6; ++a){
                if(Z.w[a] > max){
                    max = Z.w[a];
                }
            }
            Y.w[data[1]] = data[2] + gamma*max;
            trainer.train(X, Y.w);
        }

    }
    if(endFlag){
    
        if(this.PLAYED % 20 == 0){
            result.push(this.SCORE);
            console.log(result);
        }
        lastReward = 0;
        endFlag = 0;
        this.resetScene(); 
    
    }
    

};

GameState.prototype.leftInputIsActive = function() {
    var isActive = false;

    isActive = this.input.keyboard.isDown(Phaser.Keyboard.LEFT);
    // isActive |= (this.game.input.activePointer.isDown &&
    //     this.game.input.activePointer.x < this.game.width/4);

    return isActive;
};

GameState.prototype.rightInputIsActive = function() {
    var isActive = false;

    isActive = this.input.keyboard.isDown(Phaser.Keyboard.RIGHT);
    // isActive |= (this.game.input.activePointer.isDown &&
    //     this.game.input.activePointer.x > this.game.width/2 + this.game.width/4);

    return isActive;
};

GameState.prototype.upInputIsActive = function() {
    var isActive = false;

    isActive = this.input.keyboard.isDown(Phaser.Keyboard.UP);
    // isActive |= (this.game.input.activePointer.isDown &&
    //     this.game.input.activePointer.x > this.game.width/4 &&
    //     this.game.input.activePointer.x < this.game.width/2 + this.game.width/4);

    return isActive;
};

var game = new Phaser.Game(500, 500, Phaser.AUTO, 'game');
game.state.add('game', GameState, true);