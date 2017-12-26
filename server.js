// Require the packages we will use:
var http = require("http"),
	socketio = require("socket.io"),
	fs = require("fs"),
	express = require("express"),
	path = require("path"),
	url = require("url");

// we will use express to serve our CSS files
var zy = express();
var app = http.createServer(zy);
zy.use(express.static('client'));
// Listen for HTTP connections.  This is essentially a miniature static file server that only serves our one file, client.html:
zy.get('/',function(req,res){
	res.sendFile(__dirname + '/client/client.html'); // index.html
});
app.listen(3456);

// socket io listen
var io = socketio.listen(app);

// instantiate global server variables
// the userlist will store user_id:user_name in an associative array
// roomList is a doubly nested associative array that stores room names as well
// 		as the people in the room in the user_id:user_name form
// roomPasswords is an associative array that stores room names with passwords
// roomAdminList is an associative array that stores room names with their user_ids of admins
var userList = {"SERVER":1};
var roomList = {"LOBBY":{"SERVER":"SERVER"}};
var roomPasswords = {"LOBBY":""};
var roomAdminList = {"LOBBY":"SERVER"};

io.sockets.on("connection", function(socket){

	// this is the function "connect" sends the username to
	// we make sure that the username is valid, and then we proceed
	// to instantiate other uservariables like bannedFrom and mutedFrom
	socket.on("new_session_to_server", function(data) {
		var user_exists = false;
		var max_length = 10;
		// make sure user doesn't already exist
		for (var id in userList) {
			if (userList[id] == data["username"]) {
				user_exists = true;
			}
		}
		// making sure user doesn't use weird names
		if (user_exists || data["username"] == null || data["username"] == "SERVER" || data["username"] == "") {
			var error_message = "Invalid username.";
			io.to(socket.id).emit("reprompt", error_message);
		} else {
			// checking  if the username is too long
			if (data["username"].length > max_length) {
				var error_message = "Username too long. Limit to " + max_length + " characters.";
				io.to(socket.id).emit("reprompt", error_message);
			} else {
				// each user is stored in userList with unique socket.id as
				// the key and their name as the value
				userList[socket.id] = data["username"];
				roomList["LOBBY"][socket.id] = data["username"];
				// user-specfic variables are created
				socket.name = data["username"];
				socket.location = "LOBBY";
				socket.bannedFrom = [];
				socket.mutedFrom = [];
				socket.join("LOBBY");
				// update chattersList
				var arrayToSend = [];
				for (var key in roomList["LOBBY"]) {
					arrayToSend.push(roomList["LOBBY"][key]);
				}
				// update client-specific information
				io.to(socket.location).emit("name_to_client", arrayToSend);
				io.to(socket.id).emit('whoAmI', {name:socket.name, room:socket.location});
				io.to(socket.location).emit("message_to_client", {message:"A new user has joined the lobby.", name:"SERVER"});
				// refresh rooms
				var roomNames = Object.keys(roomList);
				io.sockets.emit("list_rooms", roomNames);
			}
		}
	});

	/*
		when a user disconnects, remove their IDs and disconnect 
		them from any relevant rooms
	*/
	socket.on("disconnect", function(){
		// firs check if the user exists. this helps stop a very specific error
		var doesUserExist = false;
		for (var key in userList) {
			if (key == socket.id) {
				doesUserExist = true;
			}
		}
		// if user exists, delete them from roomList as well as userList
		if (doesUserExist) {
			delete roomList[socket.location][socket.id];
			var arrayToSend = [];
			for (var key in roomList[socket.location]) {
				arrayToSend.push(roomList[socket.location][key]);
			}
			io.to(socket.location).emit("name_to_client", arrayToSend);
			io.to(socket.location).emit("message_to_client", {message:"A user has left the lobby.", name:"SERVER"});
			delete userList[socket.id];
		}
	});

	// this function processes what the user types, and has different
	// outputs depending on if its sent by an admin, if it is a command
	// if it is a whisper, or if it is just normal text
	socket.on('message_to_server', function(data) {
		if (data["name"] === "" || data["name"] === null) {
			data["name"] = "Anonymous";
		}
		// split the string up to check for commands
		var stringToSplit = data["message"];
		var splitString = stringToSplit.split(" ");
		var messageArray = splitString.slice(2, splitString.length);
		var restOfMessage = messageArray.join(" ");
		var temporaryBoolean = false;
		
		// check if user is the admin
		var amIAdmin = false;
		if (roomAdminList[socket.location] == socket.id) {
			amIAdmin = true;
		}

		// just a bunch of conditionals here based on what admin messages you want to send
		// is this a whisper command?
		// if it is, make sure you are not muted and then send only
		// to the recipient
		if (splitString[0] == "/whisper") {
			// you cant whisper if you're muted
			if (socket.mutedFrom.indexOf(socket.location) != -1) {
				io.to(socket.id).emit('process_error', {message:"You are muted.", alert:"alert-warning"});
			} else {
				// get the person who you want to whisper to
				var userToWhisperTo = splitString[1];
				if (userToWhisperTo == "Anonymous") {
					io.to(socket.id).emit('process_error', {message:"Anonymous Chatters cannot recieve whispers.", alert:"alert-danger"});
				} else if (userToWhisperTo == "SERVER") {
					io.to(socket.id).emit('process_error', {message:"You cannot whisper to the SERVER.", alert:"alert-danger"});
				} else {
					// cycle through the people in your room and whisper to them
					for (var key in roomList[socket.location]) {
						if (roomList[socket.location][key] == userToWhisperTo) {
							temporaryBoolean = true;
							if (userToWhisperTo == socket.name) {
								io.to(socket.id).emit('process_error', {message:"Whisper sent, but to yourself.", alert:"alert-warning"});
							} else {
								io.to(socket.id).emit('process_error', {message:"Whisper sent.", alert:"alert-success"});
							}
							io.to(key).emit('message_to_client', {message:"~~whisper~~  " + restOfMessage, name:data["name"]});
						}
					}
					// if you can't find the user...
					if (temporaryBoolean == false) {
						io.to(socket.id).emit('process_error', {message:"The user does not exist.", alert:"alert-danger"});
					}
				}
			}
		// check that I am the admin
		// check if is /help, then output help commands
		} else if (amIAdmin) {
			// if an admin types /help, output these
			if (splitString[0] == "/help") {
				io.to(socket.id).emit("message_to_client", {message:"Use /deleteroom to delete this room.", name:"SERVER"});
				io.to(socket.id).emit("message_to_client", {message:"Use /kick [name] to temporarily kick a user.", name:"SERVER"});
				io.to(socket.id).emit("message_to_client", {message:"Use /ban [name] to permanently ban a user.", name:"SERVER"});
				io.to(socket.id).emit("message_to_client", {message:"Use /unban [name] to unmute a muted user.", name:"SERVER"});
				io.to(socket.id).emit("message_to_client", {message:"Use /mute [name] to temporarily mute a user.", name:"SERVER"});
				io.to(socket.id).emit("message_to_client", {message:"Use /unmute [name] to unmute a muted user.", name:"SERVER"});
			} else if (splitString[0] == "/kick") {
				// function that processes kicking a user out of a room
				var userToKick = splitString[1];
				var originalID = socket.id;
				var userExists = false;
				// find that user in the room
				// if we find the user, we want to send them to LOBBY
				// we let socket = that user so we are in "their shoes"
				for (var key in roomList[socket.location]) {
					if (roomList[socket.location][key] == userToKick) {
						// leave the room
						let socket = io.sockets.connected[key];
						delete roomList[socket.location][socket.id];
						socket.leave(socket.location);
						var arrayToSend = [];
						for (var a in roomList[socket.location]) {
							arrayToSend.push(roomList[socket.location][a]);
						}
						io.to(socket.location).emit("name_to_client", arrayToSend);
						io.to(socket.location).emit("message_to_client", {message:"A user has left the lobby.", name:"SERVER"});
						// enter lobby
						roomList["LOBBY"][socket.id] = socket.name;
						socket.join("LOBBY");
						socket.location = "LOBBY";
						var arrayToSendNew = [];
						for (var b in roomList[socket.location]) {
							arrayToSendNew.push(roomList[socket.location][b]);
						}
						io.to(socket.location).emit("name_to_client", arrayToSendNew);
						// a whole load of updates for everyone on the server
						var roomNames = Object.keys(roomList);
						io.sockets.emit("list_rooms", roomNames);
						io.to(socket.id).emit("clear_screen", socket.name);
						io.to(socket.id).emit('whoAmI', {name:socket.name, room:socket.location});
						io.to(socket.location).emit("message_to_client", {message:"A new user has joined the lobby.", name:"SERVER"});
						io.to(socket.id).emit('process_room_error', {message:"Room joined.", alert:"alert-success"});
						io.to(socket.id).emit('message_to_client', {message:"You have been kicked to LOBBY.", name:"SERVER"});
						io.to(socket.id).emit("clear_errors", true); 
						userExists = true;
					}
				}
				if (userExists) {
					io.to(originalID).emit('process_error', {message:"User kicked.", alert:"alert-success"});
				} else {
					io.to(originalID).emit('process_error', {message: "You can't kick a nonexistent user.", alert: "alert-danger"});
				}
			} else if (splitString[0] == "/ban") {
				// function that bans a user permanently from a room
				var originalID = socket.id;
				var userToBan = splitString[1];
				var userExists = false;
				if (userToBan == socket.name) {
					io.to(originalID).emit('process_error', {message:"You can't ban yourself.", alert:"alert-warning"});
				} else {
					// assume the socket of the person who you want to ban
					// move them to LOBBY like you did in /mute
					// also add the room to their bannedFrom array
					for (var key in roomList[socket.location]) {
						if (roomList[socket.location][key] == userToBan) {
							let socket = io.sockets.connected[key];
							delete roomList[socket.location][socket.id];
							socket.leave(socket.location);
							socket.bannedFrom.push(socket.location);
							var temporaryRoom = socket.location;
							var arrayToSend = [];
							for (var a in roomList[socket.location]) {
								arrayToSend.push(roomList[socket.location][a]);
							}
							io.to(socket.location).emit("name_to_client", arrayToSend);
							io.to(socket.location).emit("message_to_client", {message:"A user has left the lobby.", name:"SERVER"});
							roomList["LOBBY"][socket.id] = socket.name;
							socket.join("LOBBY");
							socket.location = "LOBBY";
							var arrayToSendNew = [];
							for (var b in roomList[socket.location]) {
								arrayToSendNew.push(roomList[socket.location][b]);
							}
							io.to(socket.location).emit("name_to_client", arrayToSendNew);
							var roomNames = Object.keys(roomList);
							io.sockets.emit("list_rooms", roomNames);
							io.to(socket.id).emit("clear_screen", socket.name);
							io.to(socket.id).emit('whoAmI', {name:socket.name, room:socket.location});
							io.to(socket.location).emit("message_to_client", {message:"A new user has joined the lobby.", name:"SERVER"});
							io.to(socket.id).emit('process_room_error', {message:"Room joined.", alert:"alert-success"});
							io.to(socket.id).emit('message_to_client', {message:"You have been kicked to LOBBY.", name:"SERVER"});
							io.to(socket.id).emit('message_to_client', {message:"You are now banned from " + temporaryRoom, name:"SERVER"});
							io.to(socket.id).emit("clear_errors", true);
							userExists = true;
							
						}
					}
					if (userExists) {
						io.to(originalID).emit('process_error', {message:"User banned.", alert:"alert-success"});
					} else {
						io.to(originalID).emit('process_error', {message: "You can't ban a nonexistent user.", alert:"alert-danger"});
					}
				}
			} else if (splitString[0] == "/unban") {
				// unban a user you've previously banned
				var originalID = socket.id;
				var locationToUnban = socket.location;
				var userToUnban = splitString[1];
				// assume the socket of the person you want to unban
				// go into their bannedFrom array and delete the element
				// that is the room name
				for (var key in userList) {
					if (userList[key] == userToUnban) {
						console.log("Found the user.");
						let socket = io.sockets.connected[key];
						if (socket.bannedFrom.indexOf(locationToUnban) != -1) {
							console.log(socket.bannedFrom.indexOf(locationToUnban));
							var tempIndex = socket.bannedFrom.indexOf(locationToUnban);
							socket.bannedFrom[tempIndex] = "";
							io.to(socket.id).emit('message_to_client', {message:"You are now unbanned from " + locationToUnban, name:"SERVER"});
							io.to(socket.id).emit("clear_errors", true);
							userExists = true;
						}
					}
				}
				if (userExists) {
					io.to(originalID).emit('process_error', {message:"User unbanned.", alert:"alert-success"});
				} else {
					io.to(originalID).emit('process_error', {message: "You can't unban this user.", alert: "alert-danger"});
				}
			} else if (splitString[0] == "/mute") {
				// mute a user so their messages are not shown
				var originalID = socket.id;
				var userToMute = splitString[1];
				var userExists = false;
				if (userToMute == socket.name) {
					io.to(originalID).emit('process_error', {message:"You can't mute yourself.", alert:"alert-warning"});
				} else {
					// find the person you want to mute
					// assume their socket
					// add the room as an element to their muted from array
					for (var key in roomList[socket.location]) {
						if (roomList[socket.location][key] == userToMute) {
							let socket = io.sockets.connected[key];
							socket.mutedFrom.push(socket.location);
							io.to(socket.location).emit("message_to_client", {message:socket.name + " has been muted.", name:"SERVER"});
							io.to(socket.id).emit('message_to_client', {message:"You are now muted.", name:"SERVER"});
							io.to(socket.id).emit("clear_errors", true);
							userExists = true;
						}
					}
					if (userExists) {
						io.to(originalID).emit('process_error', {message:"User muted.", alert:"alert-success"});
					} else {
						io.to(originalID).emit('process_error', {message: "You can't mute a nonexistent user.", alert:"alert-danger"});
					}
				}
			} else if (splitString[0] == "/unmute") {
				// unmute a muted user
				var originalID = socket.id;
				var locationToUnMute = socket.location;
				var userToUnMute = splitString[1];
				// assume the socket of the user
				// remove the room from the mutedFrom array
				for (var key in userList) {
					if (userList[key] == userToUnMute) {
						let socket = io.sockets.connected[key];
						if (socket.mutedFrom.indexOf(locationToUnMute) != -1) {
							var tempIndex = socket.mutedFrom.indexOf(locationToUnMute);
							socket.mutedFrom[tempIndex] = "";
							io.to(socket.id).emit('message_to_client', {message:"You are now unmuted from " + locationToUnMute, name:"SERVER"});
							io.to(socket.id).emit("clear_errors", true);
							userExists = true;
						} 
					}
				}
				if (userExists) {
					io.to(originalID).emit('process_error', {message:"User unmuted.", alert:"alert-success"});
				} else {
					io.to(originalID).emit('process_error', {message: "You can't unmute this user.", alert: "alert-danger"});
				}
			} else if (splitString[0] == "/deleteroom") {
				// delete an entire room, sending everyone to LOBBY
				// get the room we want to delete
				var roomInQuestion = socket.location;
				var originalID = socket.id;
				// for each person in the particular room
				for (var key in roomList[roomInQuestion]) {
					let socket = io.sockets.connected[key];
					// delete the user id from the room
					delete roomList[roomInQuestion][socket.id];
					// leave the room
					socket.leave(roomInQuestion);
					// add the name into LOBBY and updat socket.location info
					roomList["LOBBY"][socket.id] = socket.name;
					socket.join("LOBBY");
					socket.location = "LOBBY";
					var arrayToSendNew = [];
					for (var b in roomList[socket.location]) {
						arrayToSendNew.push(roomList[socket.location][b]);
					}
					io.to(socket.location).emit("name_to_client", arrayToSendNew);
					io.to(socket.id).emit("clear_screen", socket.name);
					io.to(socket.id).emit('whoAmI', {name:socket.name, room:socket.location});
					io.to(socket.id).emit('process_room_error', {message:"Room joined.", alert:"alert-success"});
					io.to(socket.location).emit("message_to_client", {message:"A new user has joined the lobby.", name:"SERVER"});
					io.to(socket.id).emit('message_to_client', {message:"The room you were in was deleted.", name:"SERVER"});
					io.to(socket.id).emit("clear_errors", true); 
				}
				// delete the actual room, the password for the room, and the 
				// admin for the room
				delete roomList[roomInQuestion];
				delete roomPasswords[roomInQuestion];
				delete roomAdminList[roomInQuestion];
				io.to(originalID).emit('process_error', {message:"Room has been deleted.", alert:"alert-primary"});
				var amIAdmin = false;
				if (roomAdminList[socket.location] == socket.id) {
					amIAdmin = true;
				}
				io.to(originalID).emit("admin_tip", amIAdmin);
			} else {
				io.to(socket.id).emit('process_error', {message:"Your last message was successfully sent.", alert:"alert-primary"});
				io.to(socket.location).emit("message_to_client",{message:data["message"], name:data["name"]}); // broadcast the message to other users
			}
			var roomNames = Object.keys(roomList);
			io.sockets.emit("list_rooms", roomNames);
		} else {
			// otherwise, it is just a normal message
			// make sure we are not muted, then show from there
			if (socket.mutedFrom.indexOf(socket.location) != -1) {
				io.to(socket.id).emit('process_error', {message:"You are muted.", alert:"alert-warning"});
			} else {
				io.to(socket.id).emit('process_error', {message:"Your last message was successfully sent.", alert:"alert-primary"});
				io.to(socket.location).emit("message_to_client",{message:data["message"], name:data["name"]}); // broadcast the message to other users
			}
		}
	});

	// server-side function that helps us validate a new username
	socket.on('change_username_server', function(data) {

		// First, check if the username already exists.
		var valid_username = true;
		for (var id in userList) {
			if (userList[id] == data["new_name"]) {
				valid_username = false;
			}
		}
		// this means we went through all the names and didn't find one that matches the proposed username
		if (valid_username) {
			// make sure the username isn't too long
			var max_length = 10;
			if (data["new_name"].length > max_length) {
				io.to(socket.id).emit('process_error', {message: "This username is too long. Limit to " + max_length + " characters long. ", alert:"alert-danger"});
			} 
			// make sure the username isn't "" or null
			else if (data["new_name"] !== "" && data["new_name"] !== null && data["new_name"] != "SERVER") {
				// delete our old name from roomList
				delete roomList[socket.location][socket.id];
				// set our name to be the new name
				socket.name = data["new_name"];
				// add our new name into roomList
				roomList[socket.location][socket.id] = socket.name;
				// replace our old entry in userlist with the new entry
				userList[socket.id] = data["new_name"];
				// propagate this change to everyone in the room
				var arrayToSend = [];
				for (var key in roomList[socket.location]) {
					arrayToSend.push(roomList[socket.location][key]);
				}
				io.to(socket.location).emit("name_to_client", arrayToSend);
				io.to(socket.id).emit('whoAmI', {name:socket.name, room:socket.location});
				io.to(socket.id).emit('process_error', {message:"Username Changed!", alert:"alert-success"});
			} else {
				io.to(socket.id).emit('process_error', {message:"Invalid username.", alert:"alert-danger"});
			}
		} else {
			io.to(socket.id).emit("process_error", {message:"This username is already in use.", alert:"alert-warning"});
		}
	});

	// server side function that create a new room, and allows
	// us to join that room
	socket.on("create_room_server", function(data){
		if (socket.name == "Anonymous") {
			io.to(socket.id).emit('process_room_error', {message:"Anonymous Chatters cannot create rooms.", alert:"alert-warning"});
		} else {
			if (data["room_name"] in roomList) {
				io.to(socket.id).emit('process_room_error', {message:"Room name is already taken.", alert:"alert-danger"});
			} else {
				var max_length = 35;
				if (data["room_name"] === "" || data["room_name"] === null) {
					io.to(socket.id).emit('process_room_error', {message:"Invalid room name.", alert:"alert-danger"});
				} else if (data["room_name"].length > max_length) { // limit the length of a room name
					io.to(socket.id).emit('process_room_error', {message:"This room name is too long. Limit to " + max_length + " characters or less. ", alert:"alert-danger"});
				} else {
					// leave our current room
					delete roomList[socket.location][socket.id];
					socket.leave(socket.location);
					// tell everyone in the room we just left that we left
					var arrayToSend = [];
					for (var key in roomList[socket.location]) {
						arrayToSend.push(roomList[socket.location][key]);
					}
					io.to(socket.location).emit("name_to_client", arrayToSend);
					io.to(socket.location).emit("message_to_client", {message:"A user has left the lobby.", name:"SERVER"});
					// make a new room 
					roomList[data["room_name"]] = {};
					// add ourselves into that room
					roomList[data["room_name"]][socket.id] = socket.name;
					// add the room password
					roomPasswords[data["room_name"]] = data["room_password"];
					// add ourselves as the room admin (our id, that is)
					roomAdminList[data["room_name"]] = socket.id;
					// join that room
					socket.join(data["room_name"]);
					// change our location to reflect the new room we are now in
					socket.location = data["room_name"];
					// tell everyone in the new room (that's just us) we have arrived
					var arrayToSendNew = [];
					for (var key in roomList[socket.location]) {
						arrayToSendNew.push(roomList[socket.location][key]);
					}
					io.to(socket.location).emit("name_to_client", arrayToSendNew);
					// get the new list of rooms (now there's one more)
					var roomNames = Object.keys(roomList);
					// refresh everyone's list of rooms
					io.sockets.emit("list_rooms", roomNames);
					// clear screen for myself
					io.to(socket.id).emit("clear_screen", socket.name);
					// change personal information
					io.to(socket.id).emit('whoAmI', {name:socket.name, room:socket.location});
					// tell myself i've joined the room
					io.to(socket.location).emit("message_to_client", {message:"A new user has joined the lobby.", name:"SERVER"});
					// send out a success text!
					io.to(socket.id).emit('process_room_error', {message:"Room created and joined.", alert:"alert-success"});
					var amIAdmin = false;
					if (roomAdminList[socket.location] == socket.id) {
						amIAdmin = true;
					}
					io.to(socket.id).emit("admin_tip", amIAdmin);
				}
			}
		}
	});
	
	// a serverside function that allows us to join the room if it has no
	// password, and send us to the next function if there is a password
	socket.on("join_room", function(data){
		if (socket.location == data) {
			io.to(socket.id).emit('process_room_error', {message:"You are already in this room.", alert:"alert-warning"})
		} else {
			if (socket.bannedFrom.indexOf(data) > -1) {
				io.to(socket.id).emit('process_room_error', {message:"You are banned from that room.", alert:"alert-warning"})
			} else {
				if (roomPasswords[data] === "" || roomPasswords[data] === null) {
					// remove yourself from the previous room
					delete roomList[socket.location][socket.id];
					socket.leave(socket.location);
					var arrayToSend = [];
					for (var key in roomList[socket.location]) {
						arrayToSend.push(roomList[socket.location][key]);
					}
					io.to(socket.location).emit("name_to_client", arrayToSend);
					io.to(socket.location).emit("message_to_client", {message:"A user has left the lobby.", name:"SERVER"});
					// add yourself to the new room
					roomList[data][socket.id] = socket.name;
					socket.join(data);
					socket.location = data;
					var arrayToSendNew = [];
					for (var key in roomList[socket.location]) {
						arrayToSendNew.push(roomList[socket.location][key]);
					}
					io.to(socket.location).emit("name_to_client", arrayToSendNew);

					var roomNames = Object.keys(roomList);
					io.sockets.emit("list_rooms", roomNames);
					io.to(socket.id).emit("clear_screen", socket.name);
					io.to(socket.id).emit('whoAmI', {name:socket.name, room:socket.location});
					io.to(socket.location).emit("message_to_client", {message:"A new user has joined the lobby.", name:"SERVER"});
					io.to(socket.id).emit('process_room_error', {message:"Room joined.", alert:"alert-success"});
					var amIAdmin = false;
					if (roomAdminList[socket.location] == socket.id) {
						amIAdmin = true;
					}
					io.to(socket.id).emit("admin_tip", amIAdmin);
				} else {
					io.to(socket.id).emit("password_requirement", data);
				}
			}
		}
	});
	// if the room has a password, this serverside function 
	// validates the password to allow the user to join or not join
	socket.on("join_with_password", function(data){
		room_name = data["room_name"];
		room_password = data["room_password"];
		if (roomPasswords[room_name] == room_password) {
			//remove yourself from the old room
			delete roomList[socket.location][socket.id];
			socket.leave(socket.location);
			var arrayToSend = [];
			for (var key in roomList[socket.location]) {
				arrayToSend.push(roomList[socket.location][key]);
			}
			io.to(socket.location).emit("name_to_client", arrayToSend);
			io.to(socket.location).emit("message_to_client", {message:"A user has left the lobby.", name:"SERVER"});
			// add yourself to the new room.
			roomList[room_name][socket.id] = socket.name;
			socket.join(room_name);
			socket.location = room_name;
			var arrayToSendNew = [];
			for (var key in roomList[socket.location]) {
				arrayToSendNew.push(roomList[socket.location][key]);
			}
			io.to(socket.location).emit("name_to_client", arrayToSendNew);

			var roomNames = Object.keys(roomList);
			io.sockets.emit("list_rooms", roomNames);
			io.to(socket.id).emit("clear_screen", socket.name);
			io.to(socket.id).emit('whoAmI', {name:socket.name, room:socket.location});
			io.to(socket.location).emit("message_to_client", {message:"A new user has joined the lobby.", name:"SERVER"});
			io.to(socket.id).emit('process_room_error', {message:"Room joined.", alert:"alert-success"});
			var amIAdmin = false;
			if (roomAdminList[socket.location] == socket.id) {
				amIAdmin = true;
			}
			io.to(socket.id).emit("admin_tip", amIAdmin);
		} else {
			io.to(socket.id).emit('process_room_error', {message:"Wrong password for the room.", alert:"alert-danger"})
		}
	});
});
