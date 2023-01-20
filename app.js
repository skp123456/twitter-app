const express = require("express");

const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    app.listen(process.env.PORT || 3000, () => {
      console.log("Server is Running at http://localhost:3000");
    });
  } catch (e) {
    console.log(`DB Error:${e.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const convertDbObjToResponseObj = (dbObj) => {
  return {
    username: dbObj.username,
    tweet: dbObj.tweet,
    dateTime: dbObj.date_time,
  };
};

const convertUserObjToResponseObj = (userObj) => {
  return {
    likes: userObj.name,
  };
};
//Register API

app.post("/register/", async (request, response) => {
  const userDetails = request.body;
  const { username, password, name, gender } = userDetails;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `
    SELECT *
    FROM user
    WHERE
    username = '${username}';
  `;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createUserQuery = `
        INSERT INTO user
        (username,password,name,gender)
        VALUES
        (
            '${username}',
            '${hashedPassword}',
            '${name}',
            '${gender}'
        );
      `;
      const newUser = await db.run(createUserQuery);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//Login API

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `
        SELECT*
        FROM user
        WHERE 
        username = '${username}';
    `;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatch = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatch === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken: jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHead = request.headers["authorization"];
  if (authHead !== undefined) {
    jwtToken = authHead.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", (error, payload) => {
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

//Get latest tweet API

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
  const dbUser = await db.get(selectUserQuery);
  const followingUsersQuery = `
    SELECT following_user_id FROM follower 
    WHERE follower_user_id = ${dbUser.user_id};
  `;
  const followingUsersObjectsList = await db.all(followingUsersQuery);
  const followingUsersList = followingUsersObjectsList.map((eachObj) => {
    return eachObj.following_user_id;
  });
  const getLatestTweetQuery = `
        SELECT
        user.username,
        tweet.tweet,
        tweet.date_time
        FROM user
        INNER JOIN tweet
        ON user.user_id = tweet.user_id
        WHERE tweet.user_id IN (${followingUsersList})
        ORDER BY tweet.date_time DESC
        LIMIT 4;
    `;
  const latestTweetList = await db.all(getLatestTweetQuery);
  response.send(
    latestTweetList.map((eachObj) => convertDbObjToResponseObj(eachObj))
  );
});

//Get list of all names API

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const selectUserQuery = `
    SELECT *
    FROM user
    WHERE username = '${username}';
  `;
  const dbUser = await db.get(selectUserQuery);

  const getFollowingUserIdQuery = `
    SELECT following_user_id 
    FROM follower
    WHERE 
    follower_user_id = ${dbUser.user_id};
  `;
  const followingUsersList = await db.all(getFollowingUserIdQuery);
  const followingUserId = followingUsersList.map((eachObj) => {
    return eachObj.following_user_id;
  });
  const getAllUsersListQuery = `
        SELECT 
        name
        FROM user
        WHERE 
        user_id IN (${followingUserId});
    `;
  const usersList = await db.all(getAllUsersListQuery);
  response.send(usersList);
});

//Get user name list API

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;

  const selectUserQuery = `
    SELECT *
    FROM user
    WHERE
    username = '${username}';
  `;

  const dbUser = await db.get(selectUserQuery);

  const getFollowerUserIdQuery = `
    SELECT follower_user_id FROM follower
    WHERE 
    following_user_id = ${dbUser.user_id};
  `;
  const followerUsersList = await db.all(getFollowerUserIdQuery);

  const followerUsersId = followerUsersList.map((eachObj) => {
    return eachObj.follower_user_id;
  });
  const getUsersNameListQuery = `
        SELECT 
        name 
        FROM user
        WHERE 
        user_id IN (${followerUsersId});
    `;
  const userList = await db.all(getUsersNameListQuery);
  response.send(userList);
});

//Get specefic Tweet API

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;

  const selectUserQuery = `
    SELECT *
    FROM user
    WHERE username = '${username}';
  `;
  const dbUser = await db.get(selectUserQuery);

  const getFollowingUserIdQuery = `
    SELECT following_user_id 
    FROM follower
    WHERE 
    follower_user_id = ${dbUser.user_id};
  `;
  const followingUsersList = await db.all(getFollowingUserIdQuery);
  const followingUserId = followingUsersList.map((eachObj) => {
    return eachObj.following_user_id;
  });

  const getTweetQuery = `
    SELECT
    tweet,
    (
        SELECT
        COUNT(like_id)
        FROM like
        WHERE tweet_id = ${tweetId}
    ) AS likes,
    (
        SELECT 
        COUNT(reply_id)
        FROM reply
        WHERE tweet_id = ${tweetId}
    )AS replies,
    date_time AS dateTime
    FROM tweet
    WHERE ${tweetId} IN (${followingUserId});
 `;
  const tweet = await db.get(getTweetQuery);
  if (tweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send(tweet);
  }
});

//Get username list API

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;

    const selectUserQuery = `
    SELECT *
    FROM user
    WHERE username = '${username}';
  `;
    const dbUser = await db.get(selectUserQuery);

    const getFollowingUserIdQuery = `
    SELECT following_user_id 
    FROM follower
    WHERE 
    follower_user_id = ${dbUser.user_id};
  `;
    const followingUsersList = await db.all(getFollowingUserIdQuery);
    const getTweetQuery = `
        SELECT *
        FROM tweet
        WHERE
        tweet_id = ${tweetId};
    `;
    const tweetObj = await db.get(getTweetQuery);

    const isUserFollow = followingUsersList.some((eachObj) => {
      return eachObj.following_user_id === tweetObj.user_id;
    });

    if (isUserFollow === true) {
      const getUserQuery = `
            SELECT
            username
            FROM user
            NATURAL JOIN like
            WHERE
            tweet_id = ${tweetId};
        `;
      const usersList = await db.all(getUserQuery);
      const newResult = usersList.map((eachObj) => eachObj.username);
      response.send({ likes: newResult });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//Get list of replies API

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;

    const { username } = request;

    const selectUserQuery = `
    SELECT *
    FROM user
    WHERE username = '${username}';
  `;
    const dbUser = await db.get(selectUserQuery);

    const getFollowingUserIdQuery = `
    SELECT following_user_id 
    FROM follower
    WHERE 
    follower_user_id = ${dbUser.user_id};
  `;
    const followingUsersList = await db.all(getFollowingUserIdQuery);

    const getTweetObjQuery = `
        SELECT *
        FROM tweet
        WHERE
        tweet_id = ${tweetId};
    `;
    const tweetObj = await db.get(getTweetObjQuery);

    const isUserFollow = followingUsersList.some((eachObj) => {
      return eachObj.following_user_id === tweetObj.user_id;
    });

    if (isUserFollow === true) {
      const getRepliesListQuery = `
            SELECT 
            user.name,
            reply.reply
            FROM user
            INNER JOIN reply
            ON user.user_id = reply.user_id
            WHERE reply.tweet_id = ${tweetId};
        `;
      const repliesList = await db.all(getRepliesListQuery);
      response.send({ replies: repliesList });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//Get all tweet API

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;

  const selectUserQuery = `
        SELECT *
        FROM user
        WHERE
        username = '${username}';
    `;
  const dbUser = await db.get(selectUserQuery);
  const getAllTweetQuery = `
    SELECT
    tweet,
    (
        SELECT 
        COUNT(like_id)
        FROM like
        WHERE
        tweet_id = tweet.tweet_id
    ) AS likes,
    (
        SELECT
        COUNT(reply_id)
        FROM reply
        WHERE
        tweet_id = tweet.tweet_id
    ) AS replies,
    date_time AS dateTime
    FROM tweet
    WHERE user_id = ${dbUser.user_id};
  `;
  const allTweetList = await db.all(getAllTweetQuery);
  response.send(allTweetList);
});

//Add tweet API

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const tweetDetails = request.body;
  const { tweet } = tweetDetails;

  const createTweetQuery = `
        INSERT INTO tweet
        (tweet)
        VALUES
        ('${tweet}')
    `;
  await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

//Delete tweet API

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;

    const selectUserQuery = `
        SELECT *
        FROM user
        WHERE
        username = '${username}';
    `;
    const dbUser = await db.get(selectUserQuery);
    const getUserByTweetQuery = `
        SELECT 
        user_id
        FROM tweet
        WHERE 
        tweet_id = ${tweetId};
    `;
    const userId = await db.get(getUserByTweetQuery);
    if (userId.user_id === dbUser.user_id) {
      const deleteTweetQuery = `
            DELETE FROM tweet
            WHERE
            tweet_id = ${tweetId}
        `;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
