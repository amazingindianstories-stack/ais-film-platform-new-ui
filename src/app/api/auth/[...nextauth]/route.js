import NextAuth from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/utils/prisma"
import bcrypt from "bcryptjs"

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        let user = await prisma.user.findUnique({
          where: {
            email: credentials.email
          }
        })

        if (!user) {
          // Auto-create user for local development
          const hashedPassword = await bcrypt.hash(credentials.password, 10)
          user = await prisma.user.create({
            data: {
              email: credentials.email,
              password: hashedPassword,
              name: credentials.email.split('@')[0]
            }
          })
        } else if (!user.password) {
          return null
        }

        const isValid = await bcrypt.compare(credentials.password, user.password)

        if (!isValid) {
          return null
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image
        }
      }
    })
  ],
  session: {
    strategy: "jwt"
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id
      }
      return session
    }
  },
  pages: {
    signIn: '/login', // Adjust if your login page is somewhere else
  }
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
