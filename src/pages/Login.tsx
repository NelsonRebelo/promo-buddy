import OrderAuthLogin from "@/components/OrderAuthLogin";

const Login = () => (
  <OrderAuthLogin
    eyebrow="Secure Access"
    title="Welcome back"
    description="Login with your OLX email to run investment promotion requests."
    redirectTo="/runner"
  />
);

export default Login;
