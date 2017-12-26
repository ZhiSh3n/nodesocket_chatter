* Author 1 : [Jeremy Yu] [451021] [jeremy.yu]
* Author 2 : [Zhi Shen Yong] [450097] [zyong]

## Introduction

This repository contains the source
code for the NodeJS and SocketIO chatting website. The front-end UI is built
with HTML and CSS, along with the Bootstrap 4 Framework (see last section for
citations). The back-end is built with NodeJS and SocketIO, which also adds
dynamic behavior to the HTML. 

In order to serve up CSS content and additional styling, ExpressJS is used. To install ExpressJS,
simply use ```npm install express --save``` in the folder you are going to be 
serving the server from.

This website comprises of 3 files in total. Two of the files [client.html](client.html) 
and [client/client.css](client/client.css) should be stored in a folder called ```client```, which 
should be made parallel to the [server.js](server.js) file. 
The [server.js](server.js) file and the ```client``` folder should be stored in 
the directory directly above ```public_html```. At least, that is where we 
put ours. Again, once the files are in the right place, start up the server with ```node server.js```. Remember that ExpressJS must be installed.

## Feature Checklist

* Administration of user created chat rooms 
	* When first opening the site, the user will be prompted to enter a username.
	* By default, users are added into the LOBBY room.
	* Users can click the ```Create Room``` button to create a new room with a unique name.
	* Users can choose to add a password or leave the password field blank for a password-less room.
	* The column for ```Chatters in Room``` only displays the users currently connected to the room you are in.
	* Users will not be able to enter a room if the room is password protected and they enter the wrong password.
	* Creators of chatrooms can kick people out of rooms by typing ```/kick name``` in the messaging box.
	* Creators of chatrooms can ban people by typing ```/ban name``` in the messaging box.
		* Remember to replace ```name``` with the username of the person you want to kick or ban.
	* Users can attempt to join any chatroom by clicking on the room on the left side.
* Messaging
	* Users can send messages to everyone in the room.
	* Users can send private messages to users in the same room by typing ```/whisper name message```.
		* Replace ```name``` with the username of the user you want to message and ```message``` with the content of the message you want to send.
* Best Practices
	* Code is formatted, indented, and commented.
	* Code passes W3C validation.
	* node_modules is not commited.
* Usability
	* Website is designed in a very intuitive and user-friendly way.
	* We used Bootstrap 4 to make everything look nice.
* Creators of chatrooms have many commands at their disposal. Simply type ```/help``` into the messaging box and a list of commands will show up.
* Creators of chat rooms are able to unban people after they have banned them by using ```/unban name```.
* Creators of chat rooms are able to mute people by using ```/mute name```.
* Creators of chat rooms are able to unmute people by using ```/unmute name```.
* Creators of chat rooms are able to delete their own chat rooms by using ```/deleteroom```.
* Note that all of these commands are listed when the creator of a room types ```/help```.
* These commands do not work when users are not the creator of a room.
* When processes (such as creating a room, joining a room, banning a user, whispering, etc) are successful or unsuccessful, situational alerts appear that inform the user.
	
## Citations

We used Bootstrap 4 to help with the front-end look of this website. Nothing 
about Bootstrap relates to how the logic of Node and Socket was written. You can 
find more information about Bootstrap 4 [here](http://getbootstrap.com/docs/4.0/getting-started/introduction/).
