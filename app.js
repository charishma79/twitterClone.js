const express = require("express");
const app = express();

const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
app.use(express.json());
let db = null;
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error:${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

//Register API
//API 1
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;

  const selectUserQuery = `
            SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await db.get(selectUserQuery);
  const passwordLength = password.length;
  if (passwordLength < 6) {
    response.status(400);
    response.send("Password is too short");
  } else if (dbUser === undefined) {
    const hashedPassword = await bcrypt.hash(password, 10);
    const getRegisterQuery = `
            INSERT INTO user(username,password,name,gender)
            VALUES('${username}','${hashedPassword}','${name}','${gender}');`;
    await db.run(getRegisterQuery);
    response.send("User created successfully");
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//login API
//API 2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "MY_SECRET_KEY");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//token Validation
const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_KEY", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

//profileVerification
const profileVerification = async (request, response, next) => {
  if (true) {
    const selectUserQuery = `
            SELECT * FROM user INNER JOIN tweet ON user.user_id=tweet.user_id;`;
    const userDetails = await db.get(selectUserQuery);
    response.send(userDetails);
  } else {
    next();
  }
};

//Returns the latest tweets of people whom the user follows. Return 4 tweets at a time
//API 3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const getTweetsQuery = `
        SELECT user.username,
        tweet.tweet,tweet.date_time AS dateTime
        FROM user NATURAL JOIN tweet
        ORDER BY dateTime DESC
        LIMIT 4 OFFSET 1;`;
  const tweetQueryResponse = await db.all(getTweetsQuery);
  response.send(tweetQueryResponse);
});

//Returns the list of all names of people whom the user follows
//API 4
app.get("/user/following/", authenticateToken, async (request, response) => {
  const getUserFollowingQuery = `
        SELECT user.name AS name
        FROM user INNER JOIN follower ON user.user_id=follower.follower_user_id;`;
  const getUserNameResponse = await db.all(getUserFollowingQuery);
  response.send(getUserNameResponse);
});

//Returns the list of all names of people who follows the user
//API 5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const getFollowUserQuery = `
         SELECT  user.name AS name
            FROM user INNER JOIN follower ON user.user_id=follower.follower_user_id;`;
  const getUserFollowerResponse = await db.all(getFollowUserQuery);
  response.send(getUserFollowerResponse);
});

//API 6
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const getTweetQuery = `
        SELECT tweet.tweet,COUNT(like.like_id) AS likes,COUNT(reply.reply_id) AS replies,tweet.date_time 
        AS dateTime
        FROM 
            tweet INNER JOIN reply ON tweet.user_id=reply.user_id INNER JOIN like ON reply.user_id=like.user_id
            WHERE tweet.tweet_id='${tweetId}';`;
  const getQueryResponse = await db.get(getTweetQuery);
  if (getQueryResponse === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send(getQueryResponse);
  }
});

//API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const getLikedTweetQuery = `
        SELECT user.name AS likes
        FROM user INNER JOIN like ON user.user_id=like.user_id
        WHERE like.tweet_id='${tweetId}'`;
    const getTweetLikedQueryResponse = await db.get(getLikedTweetQuery);
    if (getTweetLikedQueryResponse === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send({
        likes: [getTweetLikedQueryResponse.likes],
      });
    }
  }
);

//API 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const getReplyQuery = `
        SELECT user.name,reply.reply FROM 
        user INNER JOIN reply ON user.user_id=reply.user_id
        WHERE reply.tweet_id='${tweetId}';`;
    const getReplyResponse = await db.all(getReplyQuery);
    if (getReplyResponse === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send({
        replies: getReplyResponse,
      });
    }
  }
);

//Returns a list of all tweets of the user
//API 9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const getTweetUserQuery = `SELECT tweet.tweet,COUNT(like.like_id) AS likes,COUNT(reply.reply_id) AS replies,
  tweet.date_time AS dateTime
    FROM tweet INNER JOIN reply ON tweet.tweet_id=reply.tweet_id NATURAL JOIN like
    ORDER BY tweet.user_id;`;
  const getTweetUsersResponse = await db.all(getTweetUserQuery);
  response.send(getTweetUsersResponse);
});

//Create a tweet in the tweet table
//API 9
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const createTweetQuery = `
        INSERT INTO tweet(tweet)
        VALUES('${tweet}');`;
  await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

//API 11
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const deleteQuery = `
        DELETE FROM tweet
        WHERE tweet.user_id='${tweetId}';`;
    await db.run(deleteQuery);

    if (undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
