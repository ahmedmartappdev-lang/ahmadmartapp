import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, MapPin, Loader2, Home, Briefcase, Trash2, Pencil, Check, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CustomerLayout } from '@/components/layouts/CustomerLayout';
import { AddressForm } from '@/components/customer/AddressForm';
import { useAddresses, Address, AddressInput } from '@/hooks/useAddresses';
import { useAuth } from '@/hooks/useAuth';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const addressIcons: Record<string, React.ReactNode> = {
  home: <Home className="w-4 h-4" />,
  work: <Briefcase className="w-4 h-4" />,
  other: <MapPin className="w-4 h-4" />,
};

const AddressesPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { addresses, isLoading, addAddress, updateAddress, deleteAddress, setDefaultAddress } = useAddresses();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/auth');
    }
  }, [isAuthenticated, navigate]);

  if (!isAuthenticated) return null;

  const handleEdit = (address: Address) => {
    setEditingAddress(address);
    setIsDialogOpen(true);
  };

  const handleAddNew = () => {
    setEditingAddress(null);
    setIsDialogOpen(true);
  };

  const handleFormSubmit = (data: AddressInput) => {
    if (editingAddress) {
      updateAddress.mutate({ id: editingAddress.id, ...data }, {
        onSuccess: () => { setIsDialogOpen(false); setEditingAddress(null); }
      });
    } else {
      addAddress.mutate(data, {
        onSuccess: () => { setIsDialogOpen(false); setEditingAddress(null); }
      });
    }
  };

  return (
    <CustomerLayout hideBottomNav={false}>
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-lg font-bold text-foreground">My Addresses</h1>
            <p className="text-xs text-muted-foreground">{addresses.length} saved address{addresses.length !== 1 ? 'es' : ''}</p>
          </div>
        </div>
      </header>

      <main>
        {/* Add New Address */}
        <div className="p-4">
          <button
            onClick={handleAddNew}
            className="w-full flex items-center gap-3 p-5 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 transition-all"
          >
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Plus className="w-5 h-5 text-primary" />
            </div>
            <div className="text-left">
              <span className="text-sm font-semibold text-primary">Add New Address</span>
              <p className="text-xs text-muted-foreground">Save a new delivery address</p>
            </div>
          </button>
        </div>

        <AddressForm
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          onSubmit={handleFormSubmit}
          initialData={editingAddress}
          isLoading={addAddress.isPending || updateAddress.isPending}
        />

        {/* Address List */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
            <p className="text-sm text-muted-foreground">Loading addresses...</p>
          </div>
        ) : addresses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4">
              <MapPin className="w-10 h-10 text-muted-foreground/50" />
            </div>
            <h3 className="font-semibold text-base text-foreground mb-1">No saved addresses</h3>
            <p className="text-sm text-muted-foreground max-w-[240px]">
              Add your first address to get faster delivery at checkout
            </p>
          </div>
        ) : (
          <div className="px-4 space-y-3">
            {addresses.map((address) => {
              const fullAddress = [
                address.address_line1,
                address.address_line2,
                address.landmark ? `Near ${address.landmark}` : null,
                `${address.city}, ${address.state} - ${address.pincode}`,
              ].filter(Boolean).join(', ');

              return (
                <div
                  key={address.id}
                  className={`relative p-5 rounded-2xl border transition-all ${
                    address.is_default
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-gray-100 bg-background hover:border-primary/20'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      address.is_default
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {addressIcons[address.address_type] || addressIcons.other}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold capitalize text-foreground">
                          {address.address_type}
                        </span>
                        {address.is_default && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                            DEFAULT
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                        {fullAddress}
                      </p>
                    </div>

                    {/* Actions */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                          <MoreVertical className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => handleEdit(address)}>
                          <Pencil className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        {!address.is_default && (
                          <DropdownMenuItem onClick={() => setDefaultAddress.mutate(address.id)}>
                            <Check className="w-4 h-4 mr-2" />
                            Set as Default
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => {
                            if (confirm('Delete this address?')) {
                              deleteAddress.mutate(address.id);
                            }
                          }}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </CustomerLayout>
  );
};

export default AddressesPage;
