const express = require("express");

const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");
const app = express();
app.use(express.json());

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

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
        request.username = payload.username;
        next();
      }
    });
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
  const username = request.username;
  const loginId = `SELECT * FROM user WHERE username='${username}';`;
  const idOfLoggedInUser = await db.get(loginId);
  const loginUserId = idOfLoggedInUser.user_id;
  const getUserFollowingQuery = `
          SELECT
            user.name as name
          FROM follower INNER JOIN user on user.user_id = follower.following_user_id
          WHERE follower.follower_user_id = ${loginUserId};`;
  const getUserNameResponse = await db.all(getUserFollowingQuery);
  response.send(getUserNameResponse);
});

//Returns the list of all names of people who follows the user
//API 5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const username = request.username;
  const loginId = `SELECT * FROM user WHERE username='${username}';`;
  const idOfLoggedInUser = await db.get(loginId);
  const loginUserId = idOfLoggedInUser.user_id;
  const getFollowUserQuery = `
         SELECT  user.name AS name
            FROM follower INNER JOIN user on user.user_id = follower.follower_user_id
          WHERE follower.following_user_id = ${loginUserId};`;
  const getUserFollowerResponse = await db.all(getFollowUserQuery);
  response.send(getUserFollowerResponse);
});

//API 6
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const username = request.username;
  const loginId = `SELECT * FROM user WHERE username='${username}';`;
  const idOfLoggedInUser = await db.get(loginId);
  const loginUserId = idOfLoggedInUser.user_id;
  //console.log(loginUserId);
  const tweetsQuery = `
        SELECT
        *
        FROM tweet
        WHERE tweet_id=${tweetId};`;
  const tweetResult = await db.get(tweetsQuery);
  //console.log(tweetResult);
  const userFollowersQuery = `
                SELECT
                *
                FROM follower INNER JOIN user on user.user_id = follower.following_user_id
                WHERE follower.follower_user_id = ${loginUserId};`;

  const userFollowers = await db.all(userFollowersQuery);

  if (
    userFollowers.some((item) => item.following_user_id === tweetResult.user_id)
  ) {
    const { tweet_id, date_time, tweet } = tweetResult;
    const getLikesQuery = `
        SELECT COUNT(like_id) AS likes FROM like
        WHERE tweet_id=${tweet_id}
        GROUP BY tweet_id`;
    const likesObject = await db.get(getLikesQuery);
    const getRepliesQuery = `
        SELECT COUNT(reply_id) AS replies FROM reply
        WHERE tweet_id=${tweet_id}
        GROUP BY tweet_id`;
    const repliesObject = await db.get(getRepliesQuery);
    response.send({
      tweet,
      likes: likesObject.likes,
      replies: repliesObject.replies,
      dateTime: date_time,
    });
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const username = request.username;
    const loginId = `SELECT * FROM user WHERE username='${username}';`;
    const idOfLoggedInUser = await db.get(loginId);
    const loginUserId = idOfLoggedInUser.user_id;
    //console.log(loginUserId);
    const tweetsQuery = `
        SELECT
        *
        FROM tweet
        WHERE tweet_id=${tweetId};`;
    const tweetResult = await db.get(tweetsQuery);
    console.log(tweetResult);
    const userFollowersQuery = `
                SELECT
                *
                FROM follower INNER JOIN user on user.user_id = follower.following_user_id
                WHERE follower.follower_user_id = ${loginUserId};`;

    const userFollowers = await db.all(userFollowersQuery);

    if (
      userFollowers.some(
        (item) => item.following_user_id === tweetResult.user_id
      )
    ) {
      const getLikedTweetQuery = `
        SELECT  user.username
        FROM user NATURAL JOIN like 
        WHERE like.tweet_id=${tweetId}`;
      const getTweetLikedQueryResponse = await db.all(getLikedTweetQuery);
      let newArr = [];
      for (let i = 0; i < getTweetLikedQueryResponse.length; i++) {
        let name_text = getTweetLikedQueryResponse[i];
        newArr.push(name_text.username);
      }

      console.log(newArr);

      response.send({ likes: newArr });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;

    const username = request.username;
    const loginId = `SELECT * FROM user WHERE username='${username}';`;
    const idOfLoggedInUser = await db.get(loginId);
    const loginUserId = idOfLoggedInUser.user_id;
    //console.log(loginUserId);
    const tweetsQuery = `
        SELECT
        *
        FROM tweet
        WHERE tweet_id=${tweetId};`;
    const tweetResult = await db.get(tweetsQuery);
    const userFollowersQuery = `
            SELECT
             *
            FROM follower INNER JOIN user on user.user_id = follower.following_user_id
            WHERE follower.follower_user_id = ${loginUserId};`;
    const userFollowers = await db.all(userFollowersQuery);
    if (
      userFollowers.some(
        (item) => item.following_user_id === tweetResult.user_id
      )
    ) {
      const getReplyQuery = `
            SELECT user.name,reply.reply FROM 
            user INNER JOIN reply ON user.user_id=reply.user_id
            WHERE reply.tweet_id='${tweetId}';`;
      const getReplyResponse = await db.all(getReplyQuery);
      response.send({
        replies: getReplyResponse,
      });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//Returns a list of all tweets of the user
//API 9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const username = request.username;
  const loginId = `SELECT * FROM user WHERE username='${username}';`;
  const idOfLoggedInUser = await db.get(loginId);
  const loginUserId = idOfLoggedInUser.user_id;
  //console.log(loginUserId);
  const getUserTweetsResponse = `SELECT tweet.tweet,COUNT(DISTINCT like.like_id) AS likes,COUNT(DISTINCT reply.reply_id) AS replies,
                                    tweet.date_time AS dateTime
                                    FROM tweet
                                    INNER JOIN like ON tweet.tweet_id=like.tweet_id
                                    INNER JOIN  reply ON like.tweet_id=reply.tweet_id
                                    
                                    WHERE tweet.user_id=${loginUserId} GROUP BY tweet.tweet_id`;

  const tweetsResponse = await db.all(getUserTweetsResponse);
  response.send(tweetsResponse);
});

//Create a tweet in the tweet table
//API 10
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
    const username = request.username;
    const loginId = `SELECT * FROM user WHERE username='${username}';`;
    const idOfLoggedInUser = await db.get(loginId);
    const loginUserId = idOfLoggedInUser.user_id;
    //console.log(loginUserId);
    const tweetsQuery = `
        SELECT
        *
        FROM tweet WHERE tweet_id=${tweetId};`;
    const tweetResult = await db.get(tweetsQuery);
    // console.log(tweetResult);

    if (loginUserId === tweetResult.user_id) {
      const deleteQuery = `
        DELETE FROM tweet WHERE tweet_id=${tweetId} 
        AND tweet.user_id=${loginUserId};`;
      await db.run(deleteQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
