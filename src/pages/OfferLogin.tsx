import OrderAuthLogin from "@/components/OrderAuthLogin";

const OfferLogin = () => (
  <OrderAuthLogin
    eyebrow="Offer promotion"
    title="Login with your OKTA credentials"
    description="Login with your OLX email to run offer promotion requests."
    redirectTo="/offer-runner"
  />
);

export default OfferLogin;
