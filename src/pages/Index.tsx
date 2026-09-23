import { Link } from "react-router-dom";
import OrderAuthLogin from "@/components/OrderAuthLogin";

const Index = () => (
  <OrderAuthLogin
    eyebrow="Order Management"
    title="Order Management"
    description="Login with your OLX email to continue."
    redirectTo="/order-management"
    hideBack
    showLogo
    footer={
      <div className="mt-4 text-center">
        <Link to="/old-system" className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Use old system
        </Link>
      </div>
    }
  />
);

export default Index;
