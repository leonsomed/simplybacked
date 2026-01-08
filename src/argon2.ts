import { argon2 } from "node:crypto";

export default async (passphrase: string, salt: string): Promise<Buffer> => {
  return new Promise<Buffer>((resolve, reject) => {
    argon2(
      "argon2d",
      {
        memory: 65536,
        parallelism: 2,
        passes: 10,
        message: passphrase,
        nonce: salt,
        tagLength: 32,
      },
      (error, data) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(data);
      },
    );
  });
};
