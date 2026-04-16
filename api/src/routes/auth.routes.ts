import { Router } from "express"
import { registerUser, loginUser, getMe, logoutUser, setPassword } from "../controllers/auth.controller"

const router = Router()

router.post("/register", registerUser)
router.post("/login", loginUser)
router.get("/me", getMe)
router.post("/logout", logoutUser)
router.post("/set-password", setPassword)

export default router