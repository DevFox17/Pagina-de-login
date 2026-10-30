const fs = require('fs');
const path = require('path');



const databasePath = path.join(__dirname, 'db.json');

function readDatabase() {
  try {
    return JSON.parse(fs.readFileSync(databasePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { users: [] };
    }
    throw error;
  }
}

function saveUser(user) {
  const database = readDatabase();
  const nextId = database.users.reduce((highestId, currentUser) => Math.max(highestId, currentUser.id || 0), 0) + 1;

  database.users.push({ id: nextId, ...user });
  fs.writeFileSync(databasePath, `${JSON.stringify(database, null, 2)}\n`, 'utf8');

  return database.users[database.users.length - 1];
}

function findUserByEmail(email) {
  const normalizedEmail = email.trim().toLowerCase();
  return readDatabase().users.find(
    (user) => user.email.trim().toLowerCase() === normalizedEmail,
  );
}

function updateUserPassword(email, password) {
  const database = readDatabase();
  const normalizedEmail = email.trim().toLowerCase();
  const user = database.users.find(
    (currentUser) => currentUser.email.trim().toLowerCase() === normalizedEmail,
  );

  if (!user) {
    return false;
  }

  user.hash = password.hash;
  user.salt = password.salt;
  fs.writeFileSync(databasePath, `${JSON.stringify(database, null, 2)}\n`, 'utf8');

  return true;
}

// function findUserBySenha(senha) {
//   return readDatabase().users.find((user) => user.senha === senha);
// }

module.exports = { findUserByEmail, saveUser, updateUserPassword };